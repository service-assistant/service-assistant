import { serverApiUrl } from '../../../../../src/config/serverApi';

const ATTACHMENTS_URL = serverApiUrl("api/attachments");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

function getRouteParams(request: Request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/attachments\/([^/]+)\/devices\/([^/]+)/);

  return {
    attachmentId: match?.[1] ? decodeURIComponent(match[1]) : undefined,
    deviceId: match?.[2] ? decodeURIComponent(match[2]) : undefined
  };
}

async function forwardDeviceAssignment(request: Request, method: "DELETE" | "POST") {
  const token = readAuthToken();
  const { attachmentId, deviceId } = getRouteParams(request);

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  if (!attachmentId || !deviceId) {
    return jsonResponse({ detail: "Brak ID dokumentu lub maszyny w adresie requestu." }, 400);
  }

  let response: Response;

  try {
    response = await fetch(`${ATTACHMENTS_URL}/${encodeURIComponent(attachmentId)}/devices/${encodeURIComponent(deviceId)}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {})
      },
      body: method === "POST" ? "{}" : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge zapisac powiazan w staging API: ${message}` }, 502);
  }

  if (response.status === 204 || response.status === 205) {
    return new Response(null, {
      status: response.status
    });
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}

export async function POST(request: Request) {
  return forwardDeviceAssignment(request, "POST");
}

export async function DELETE(request: Request) {
  return forwardDeviceAssignment(request, "DELETE");
}
