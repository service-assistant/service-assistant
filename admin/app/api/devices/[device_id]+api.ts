import { serverApiUrl } from '../../../src/config/serverApi';

const DEVICES_URL = serverApiUrl("api/devices");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

function getDeviceId(request: Request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/devices\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function DELETE(request: Request) {
  const token = readAuthToken();
  const deviceId = getDeviceId(request);

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  if (!deviceId) {
    return jsonResponse({ detail: "Brak device_id maszyny w adresie requestu." }, 400);
  }

  let response: Response;

  try {
    response = await fetch(`${DEVICES_URL}/${deviceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge usunac maszyny ze staging API: ${message}` }, 502);
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
