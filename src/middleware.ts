import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/logo.png"];

// Lo único que puede abrir el usuario de Producción. La sincronización con la
// planilla y la corrección de unidades quedan solo para admin.
const RUTAS_PRODUCCION = ["/recetario", "/api/recetario/productos", "/api/recetario/calcular", "/api/auth/logout"];

function empiezaCon(pathname: string, rutas: string[]): boolean {
  return rutas.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (empiezaCon(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const rol = await verifySessionToken(token);
  if (!rol) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (rol === "produccion" && !empiezaCon(pathname, RUTAS_PRODUCCION)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/recetario";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
