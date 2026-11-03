
export async function trackBusinessView(
  businessId: string
): Promise<void> {
  const cleanBusinessId = businessId.trim();

  if (!cleanBusinessId) {
    return;
  }

  try {
    const response = await fetch(
      "/api/events/business-view",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessId: cleanBusinessId,
        }),
        credentials: "same-origin",
        keepalive: true,
      }
    );

    if (!response.ok) {
      console.warn(
        "Business view tracking was not successful:",
        response.status
      );
    }
  } catch (error) {
    console.error(
      "Business view tracking error:",
      error
    );
  }
}
