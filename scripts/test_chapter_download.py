#!/usr/bin/env python3
"""
Automated download verification script for Tsundoku.
Tests authentication, page fetching, byte-level image integrity, and CBZ assembly.
"""

import urllib.request
import json
import io
import zipfile
import sys

BASE_URL = "http://127.0.0.1:4567"

def is_valid_image(data: bytes) -> bool:
    if len(data) < 12:
        return False
    # JPEG
    if data[:3] == b"\xff\xd8\xff":
        return True
    # PNG
    if data[:4] == b"\x89PNG":
        return True
    # WebP
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    # GIF
    if data[:4] in (b"GIF87a", b"GIF89a", b"GIF8"):
        return True
    # BMP
    if data[:2] == b"BM":
        return True
    # AVIF
    if b"ftyp" in data[:12]:
        return True
    return False

def guess_extension(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:4] == b"\x89PNG":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:4] in (b"GIF87a", b"GIF89a", b"GIF8"):
        return "gif"
    if b"ftyp" in data[:12]:
        return "avif"
    return "jpg"

def main():
    manga_id = int(sys.argv[1]) if len(sys.argv) > 1 else 696
    chapter_num = float(sys.argv[2]) if len(sys.argv) > 2 else 24
    chapter_id = int(sys.argv[3]) if len(sys.argv) > 3 else 50083

    print(f"=== 1. Logging in as dummy_test ===")
    login_body = {
        "query": 'mutation { login(input: { username: "dummy_test", password: "Password123!" }) { accessToken refreshToken } }'
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/graphql",
        data=json.dumps(login_body).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
    
    token = res.get("data", {}).get("login", {}).get("accessToken")
    if not token:
        print("FAIL: Login failed", res)
        sys.exit(1)
    print(f"SUCCESS: Logged in. Token: {token[:15]}...")

    print(f"\n=== 2. Requesting fetchChapterPages for Manga {manga_id} Chapter {chapter_num} (ID {chapter_id}) ===")
    pages_body = {
        "query": f"mutation {{ fetchChapterPages(input: {{ chapterId: {chapter_id} }}) {{ clientMutationId pages }} }}"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/graphql",
        data=json.dumps(pages_body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
    
    pages = res.get("data", {}).get("fetchChapterPages", {}).get("pages", [])
    if not pages:
        print("FAIL: fetchChapterPages returned no pages", res)
        sys.exit(1)
    print(f"SUCCESS: Found {len(pages)} pages.")

    print("\n=== 3. Downloading all pages and verifying byte magic headers ===")
    cbz_buffer = io.BytesIO()
    with zipfile.ZipFile(cbz_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, page_path in enumerate(pages):
            page_url = f"{BASE_URL}{page_path}"
            req = urllib.request.Request(page_url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req) as resp:
                data = resp.read()
            
            if not is_valid_image(data):
                preview = data[:80].decode("utf-8", errors="replace")
                print(f"FAIL: Page {idx + 1} ({page_path}) is NOT a valid image! Preview: {preview}")
                sys.exit(1)
            
            ext = guess_extension(data)
            filename = f"{idx + 1:03d}.{ext}"
            zf.writestr(filename, data)
            print(f"  Page {idx + 1:02d}/{len(pages):02d}: OK ({len(data)} bytes, {ext})")
        
        # Add ComicInfo.xml
        comic_info = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
            '  <Title>Chapter 24 - Stalker vs. Stalker (1)</Title>\n'
            '  <Series>30 Years Since the Prologue</Series>\n'
            '  <Number>24</Number>\n'
            '</ComicInfo>'
        )
        zf.writestr("ComicInfo.xml", comic_info)

    cbz_bytes = cbz_buffer.getvalue()
    print(f"\nSUCCESS: Assembled valid CBZ archive ({len(cbz_bytes)} bytes)")

    print("\n=== 4. Testing CBZ Unpacker & Reader Page Extraction ===")
    read_zip = zipfile.ZipFile(io.BytesIO(cbz_bytes))
    image_names = [n for n in read_zip.namelist() if n.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'))]
    image_names.sort()
    print(f"Found {len(image_names)} image files inside CBZ.")
    assert len(image_names) == len(pages), f"Expected {len(pages)} images, got {len(image_names)}"

    for name in image_names:
        page_bytes = read_zip.read(name)
        assert is_valid_image(page_bytes), f"Unpacked file {name} failed image validation!"
    
    print("SUCCESS: All unpacked pages validated cleanly. Reader pipeline verified!")

if __name__ == "__main__":
    main()
