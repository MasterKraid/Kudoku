#!/usr/bin/env python3
import urllib.request
import json
import base64
import sys

BASE_URL = "http://127.0.0.1:4567"

def is_valid_image(data: bytes) -> bool:
    if len(data) < 12:
        return False
    if data[:3] == b"\xff\xd8\xff": return True
    if data[:4] == b"\x89PNG": return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return True
    if data[:4] in (b"GIF87a", b"GIF89a", b"GIF8"): return True
    if data[:2] == b"BM": return True
    if b"ftyp" in data[:12]: return True
    return False

def guess_type(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff": return "jpeg"
    if data[:4] == b"\x89PNG": return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "webp"
    if data[:4] in (b"GIF87a", b"GIF89a", b"GIF8"): return "gif"
    if data[:2] == b"BM": return "bmp"
    if b"ftyp" in data[:12]: return "avif"
    return "unknown"

def main():
    print("=== 1. Logging in as dummy_test ===")
    login_body = {
        "query": 'mutation { login(input: { username: "dummy_test", password: "Password123!" }) { accessToken } }'
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/graphql",
        data=json.dumps(login_body).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
    token = res.get("data", {}).get("login", {}).get("accessToken")
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    print("Login successful.")

    print("\n=== 2. Gathering candidate mangas across all sources ===")
    query_mangas = """
    {
      mangas(condition: { inLibrary: false }, first: 3000) {
        nodes {
          id
          title
          sourceId
          source {
            displayName
          }
          chapters {
            nodes {
              id
              name
              chapterNumber
            }
          }
        }
      }
    }
    """
    req = urllib.request.Request(f"{BASE_URL}/api/graphql", data=json.dumps({"query": query_mangas}).encode(), headers=headers)
    with urllib.request.urlopen(req) as resp:
        mangas_res = json.loads(resp.read().decode())

    all_mangas = mangas_res.get("data", {}).get("mangas", {}).get("nodes", [])
    print(f"Total candidate mangas in DB: {len(all_mangas)}")

    # Group by source
    by_source = {}
    for m in all_mangas:
        s_name = (m.get("source") or {}).get("displayName")
        if not s_name or s_name == "Local/Unknown":
            continue
        chapters = m.get("chapters", {}).get("nodes", [])
        if not chapters:
            continue
        if s_name not in by_source:
            by_source[s_name] = []
        by_source[s_name].append(m)

    print(f"Sources with active chapters ({len(by_source)}): {list(by_source.keys())}")

    # Select 20 mangas from different sources (1 per source)
    selected = []
    for s_name in sorted(by_source.keys()):
        if len(selected) >= 20:
            break
        selected.append(by_source[s_name][0])

    # If fewer than 20 sources, fill up with second manga from diverse sources
    idx = 1
    while len(selected) < 20:
        added = False
        for s_name in sorted(by_source.keys()):
            if len(by_source[s_name]) > idx and len(selected) < 20:
                selected.append(by_source[s_name][idx])
                added = True
        idx += 1
        if not added:
            break

    print(f"\n=== 3. Testing 20 distinct mangas across {len(set(m['source']['displayName'] for m in selected))} distinct sources ===")

    results = []
    for i, m in enumerate(selected, 1):
        s_name = m["source"]["displayName"]
        title = m["title"]
        m_id = m["id"]
        ch = m["chapters"]["nodes"][0]
        ch_id = ch["id"]
        ch_name = ch["name"] or f"Chapter {ch.get('chapterNumber')}"

        print(f"\n[{i:02d}/20] Source: '{s_name}' | Manga: '{title[:32]}' | Chapter: '{ch_name[:20]}' (ID: {ch_id})")

        mutation = {
            "query": f"mutation {{ fetchChapterPages(input: {{ chapterId: {ch_id} }}) {{ clientMutationId pages }} }}"
        }
        req = urllib.request.Request(f"{BASE_URL}/api/graphql", data=json.dumps(mutation).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                mut_res = json.loads(resp.read().decode())
            pages = mut_res.get("data", {}).get("fetchChapterPages", {}).get("pages", [])
            if not pages:
                print(f"  -> FAIL: 0 pages returned")
                results.append((i, s_name, title, "0 pages", False, 0, ""))
                continue

            # Fetch first page buffer
            p1_url = f"{BASE_URL}{pages[0]}"
            p_req = urllib.request.Request(p1_url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(p_req, timeout=25) as p_resp:
                buf = p_resp.read()

            valid = is_valid_image(buf)
            img_type = guess_type(buf)
            if valid:
                print(f"  -> PASS: {len(pages)} pages total. Page 1 validated: {len(buf)} bytes, format: {img_type.upper()}")
                results.append((i, s_name, title, f"{len(pages)} pages", True, len(buf), img_type))
            else:
                preview = buf[:50].decode("utf-8", errors="replace")
                print(f"  -> FAIL: Invalid image magic bytes! Preview: {preview}")
                results.append((i, s_name, title, f"Invalid: {preview}", False, len(buf), "invalid"))
        except Exception as e:
            print(f"  -> FAIL: Exception: {e}")
            results.append((i, s_name, title, f"Exception: {e}", False, 0, "error"))

    print("\n" + "="*95)
    print("20-MANGA VERIFICATION RESULTS MATRIX:")
    print("="*95)
    pass_count = sum(1 for r in results if r[4])
    for r in results:
        status_str = "PASS" if r[4] else "FAIL"
        print(f"#{r[0]:02d} | [{status_str}] | {r[1][:22]:22s} | {r[2][:28]:28s} | {r[3]:12s} | {r[6].upper():5s} ({r[5]} bytes)")
    print("="*95)
    if results:
        print(f"FINAL SCORE: {pass_count}/{len(results)} PASSED ({pass_count/len(results)*100:.1f}%)")

if __name__ == "__main__":
    main()
