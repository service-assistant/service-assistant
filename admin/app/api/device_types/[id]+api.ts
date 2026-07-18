import { serverApiUrl } from '../../../src/config/serverApi';

const DEVICE_TYPES_URL = serverApiUrl("api/device_types");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

function getDeviceTypeId(request: Request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/device_types\/([^/]+)/);
  return match?.[1];
}

async function fetchDeviceTypes(token: string) {
  const response = await fetch(DEVICE_TYPES_URL, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać typów maszyn (${response.status}).`);
  }

  return (await response.json()) as Array<{ id: number; name: string }>;
}

async function forwardDeviceTypeUpdate(id: string, request: Request) {
  const token = readAuthToken();

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  const body = await request.text();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": request.headers.get("Content-Type") ?? "application/json"
  };
  let response = await fetch(`${DEVICE_TYPES_URL}/${encodeURIComponent(id)}`, {
    body,
    headers,
    method: "PATCH"
  });

  if (response.status === 405 || response.status === 501) {
    response = await fetch(`${DEVICE_TYPES_URL}/${encodeURIComponent(id)}`, {
      body,
      headers,
      method: "PUT"
    });
  }

  if (response.status === 204) {
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

export async function GET(request: Request) {
  const token = readAuthToken();
  const id = getDeviceTypeId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID typu maszyny." }, 400);
  }

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  try {
    const deviceTypes = await fetchDeviceTypes(token);
    const deviceType = deviceTypes.find((item) => String(item.id) === id);

    if (!deviceType) {
      return jsonResponse({ detail: `Nie znaleziono typu maszyny o ID ${id}.` }, 404);
    }

    return Response.json(deviceType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd połączenia ze staging API.";
    return jsonResponse({ detail: message }, 502);
  }
}

export async function PATCH(request: Request) {
  const id = getDeviceTypeId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID typu maszyny." }, 400);
  }

  return forwardDeviceTypeUpdate(id, request);
}

export async function PUT(request: Request) {
  const id = getDeviceTypeId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID typu maszyny." }, 400);
  }

  return forwardDeviceTypeUpdate(id, request);
}

export async function DELETE(request: Request) {
  const token = readAuthToken();
  const id = getDeviceTypeId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID typu maszyny." }, 400);
  }

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  let response: Response;

  try {
    response = await fetch(`${DEVICE_TYPES_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge usunac typu maszyny ze staging API: ${message}` }, 502);
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
