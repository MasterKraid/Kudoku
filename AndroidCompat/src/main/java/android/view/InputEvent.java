package android.view;

import android.os.Parcel;
import android.os.Parcelable;

public abstract class InputEvent implements Parcelable {
    protected int mSeq;

    protected InputEvent() {}

    public abstract int getDeviceId();
    public abstract int getSource();
    public abstract long getEventTime();

    public boolean isFromSource(int source) {
        return (getSource() & source) == source;
    }

    public static final Parcelable.Creator<InputEvent> CREATOR = new Parcelable.Creator<InputEvent>() {
        @Override
        public InputEvent createFromParcel(Parcel in) { return null; }
        @Override
        public InputEvent[] newArray(int size) { return new InputEvent[size]; }
    };

    @Override
    public int describeContents() { return 0; }
}
