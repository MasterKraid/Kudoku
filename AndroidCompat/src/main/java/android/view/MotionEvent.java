package android.view;

import android.os.Parcel;
import android.os.Parcelable;

public class MotionEvent extends InputEvent implements Parcelable {
    public static final int ACTION_DOWN = 0;
    public static final int ACTION_UP = 1;
    public static final int ACTION_MOVE = 2;
    public static final int ACTION_CANCEL = 3;
    public static final int ACTION_OUTSIDE = 4;
    public static final int ACTION_POINTER_DOWN = 5;
    public static final int ACTION_POINTER_UP = 6;
    public static final int ACTION_HOVER_MOVE = 7;
    public static final int ACTION_SCROLL = 8;
    public static final int ACTION_HOVER_ENTER = 9;
    public static final int ACTION_HOVER_EXIT = 10;
    public static final int ACTION_BUTTON_PRESS = 11;
    public static final int ACTION_BUTTON_RELEASE = 12;

    public static final int ACTION_MASK = 0xff;
    public static final int ACTION_POINTER_INDEX_MASK = 0xff00;
    public static final int ACTION_POINTER_INDEX_SHIFT = 8;

    public static final int TOOL_TYPE_UNKNOWN = 0;
    public static final int TOOL_TYPE_FINGER = 1;
    public static final int TOOL_TYPE_STYLUS = 2;
    public static final int TOOL_TYPE_MOUSE = 3;
    public static final int TOOL_TYPE_ERASER = 4;

    private long downTime;
    private long eventTime;
    private int action;
    private int pointerCount;
    private PointerProperties[] pointerProperties;
    private PointerCoords[] pointerCoords;
    private int metaState;
    private int buttonState;
    private float xPrecision;
    private float yPrecision;
    private int deviceId;
    private int edgeFlags;
    private int source;
    private int flags;

    public static final class PointerProperties {
        public int id;
        public int toolType;

        public PointerProperties() {
            clear();
        }

        public PointerProperties(PointerProperties other) {
            copyFrom(other);
        }

        public void clear() {
            id = -1;
            toolType = TOOL_TYPE_UNKNOWN;
        }

        public void copyFrom(PointerProperties other) {
            id = other.id;
            toolType = other.toolType;
        }

        @Override
        public boolean equals(Object other) {
            if (other instanceof PointerProperties) {
                PointerProperties o = (PointerProperties) other;
                return id == o.id && toolType == o.toolType;
            }
            return false;
        }

        @Override
        public int hashCode() {
            return id | (toolType << 8);
        }
    }

    public static final class PointerCoords {
        public float x;
        public float y;
        public float pressure;
        public float size;
        public float touchMajor;
        public float touchMinor;
        public float toolMajor;
        public float toolMinor;
        public float orientation;

        public PointerCoords() {
            clear();
        }

        public PointerCoords(PointerCoords other) {
            copyFrom(other);
        }

        public void clear() {
            x = 0;
            y = 0;
            pressure = 0;
            size = 0;
            touchMajor = 0;
            touchMinor = 0;
            toolMajor = 0;
            toolMinor = 0;
            orientation = 0;
        }

        public void copyFrom(PointerCoords other) {
            x = other.x;
            y = other.y;
            pressure = other.pressure;
            size = other.size;
            touchMajor = other.touchMajor;
            touchMinor = other.touchMinor;
            toolMajor = other.toolMajor;
            toolMinor = other.toolMinor;
            orientation = other.orientation;
        }
    }

    public static MotionEvent obtain(
            long downTime, long eventTime, int action, int pointerCount,
            PointerProperties[] pointerProperties, PointerCoords[] pointerCoords,
            int metaState, int buttonState, float xPrecision, float yPrecision,
            int deviceId, int edgeFlags, int source, int flags) {
        MotionEvent ev = new MotionEvent();
        ev.downTime = downTime;
        ev.eventTime = eventTime;
        ev.action = action;
        ev.pointerCount = pointerCount;
        ev.pointerProperties = pointerProperties;
        ev.pointerCoords = pointerCoords;
        ev.metaState = metaState;
        ev.buttonState = buttonState;
        ev.xPrecision = xPrecision;
        ev.yPrecision = yPrecision;
        ev.deviceId = deviceId;
        ev.edgeFlags = edgeFlags;
        ev.source = source;
        ev.flags = flags;
        return ev;
    }

    public static MotionEvent obtain(
            long downTime, long eventTime, int action,
            float x, float y, float pressure, float size,
            int metaState, float xPrecision, float yPrecision,
            int deviceId, int edgeFlags) {
        PointerProperties[] props = new PointerProperties[] { new PointerProperties() };
        props[0].id = 0;
        PointerCoords[] coords = new PointerCoords[] { new PointerCoords() };
        coords[0].x = x;
        coords[0].y = y;
        coords[0].pressure = pressure;
        coords[0].size = size;
        return obtain(downTime, eventTime, action, 1, props, coords, metaState, 0, xPrecision, yPrecision, deviceId, edgeFlags, 0, 0);
    }

    public static MotionEvent obtain(long downTime, long eventTime, int action, float x, float y, int metaState) {
        return obtain(downTime, eventTime, action, x, y, 1.0f, 1.0f, metaState, 1.0f, 1.0f, 0, 0);
    }

    public void recycle() {
        // no-op pool recycling
    }

    public int getAction() { return action; }
    public int getActionMasked() { return action & ACTION_MASK; }
    public int getActionIndex() { return (action & ACTION_POINTER_INDEX_MASK) >> ACTION_POINTER_INDEX_SHIFT; }
    public long getDownTime() { return downTime; }

    @Override
    public long getEventTime() { return eventTime; }

    @Override
    public int getSource() { return source; }

    @Override
    public int getDeviceId() { return deviceId; }

    public float getX() { return pointerCoords != null && pointerCoords.length > 0 ? pointerCoords[0].x : 0; }
    public float getY() { return pointerCoords != null && pointerCoords.length > 0 ? pointerCoords[0].y : 0; }
    public float getPressure() { return pointerCoords != null && pointerCoords.length > 0 ? pointerCoords[0].pressure : 0; }
    public float getSize() { return pointerCoords != null && pointerCoords.length > 0 ? pointerCoords[0].size : 0; }
    public int getPointerCount() { return pointerCount; }

    @Override
    public int describeContents() { return 0; }

    @Override
    public void writeToParcel(Parcel dest, int flags) {}

    public static final Parcelable.Creator<MotionEvent> CREATOR = new Parcelable.Creator<MotionEvent>() {
        @Override
        public MotionEvent createFromParcel(Parcel in) { return new MotionEvent(); }
        @Override
        public MotionEvent[] newArray(int size) { return new MotionEvent[size]; }
    };
}
