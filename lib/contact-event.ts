export type ContactEventPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS";

type TrackContactEventOptions = {
  businessId: string;
  platform: ContactEventPlatform;
  requestId?: string;
};

export async function trackContactEvent({
  businessId,
  platform,
  requestId,
}: TrackContactEventOptions): Promise<void> {
  try {
    await fetch("/api/events/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessId,
        platform,
        requestId,
      }),
      keepalive: true,
    });
  } catch (error) {
    console.error(
      "Failed to track contact event:",
      error,
    );
  }
}