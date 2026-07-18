import { serverApiUrl } from '../../../src/config/serverApi';

const BRANDS_URL = serverApiUrl("api/brands");

function readAuthToken() {
  return process.env.AUTH_TOKEN ?? "";
}

function jsonResponse(body: { detail: string }, status: number) {
  return Response.json(body, { status });
}

function getBrandId(request: Request) {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/brands\/([^/]+)/);
  return match?.[1];
}

async function fetchBrands(token: string) {
  const response = await fetch(BRANDS_URL, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać marek (${response.status}).`);
  }

  return (await response.json()) as Array<{ id: number; logo_url?: string; name: string }>;
}

async function forwardBrandUpdate(id: string, request: Request) {
  const token = readAuthToken();

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  const body = await request.text();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": request.headers.get("Content-Type") ?? "application/json"
  };
  let response = await fetch(`${BRANDS_URL}/${encodeURIComponent(id)}`, {
    body,
    headers,
    method: "PATCH"
  });

  if (response.status === 405 || response.status === 501) {
    response = await fetch(`${BRANDS_URL}/${encodeURIComponent(id)}`, {
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
  const id = getBrandId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID marki." }, 400);
  }

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  try {
    const brands = await fetchBrands(token);
    const brand = brands.find((item) => String(item.id) === id);

    if (!brand) {
      return jsonResponse({ detail: `Nie znaleziono marki o ID ${id}.` }, 404);
    }

    return Response.json(brand);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd połączenia ze staging API.";
    return jsonResponse({ detail: message }, 502);
  }
}

export async function PATCH(request: Request) {
  const id = getBrandId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID marki." }, 400);
  }

  return forwardBrandUpdate(id, request);
}

export async function PUT(request: Request) {
  const id = getBrandId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID marki." }, 400);
  }

  return forwardBrandUpdate(id, request);
}

export async function DELETE(request: Request) {
  const token = readAuthToken();
  const id = getBrandId(request);

  if (!id) {
    return jsonResponse({ detail: "Brak ID marki." }, 400);
  }

  if (!token) {
    return jsonResponse({ detail: "Brak AUTH_TOKEN w procesie Expo. Zrestartuj dev server po zmianie .env." }, 500);
  }

  let response: Response;

  try {
    response = await fetch(`${BRANDS_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany blad polaczenia ze staging API.";
    return jsonResponse({ detail: `Nie moge usunac marki ze staging API: ${message}` }, 502);
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
