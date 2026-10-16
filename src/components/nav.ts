import type { IconName } from "./NavIcon";

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: IconName;
  links: NavLink[];
}

// Grupos primero (para no repetir 13 links sueltos en el menú), sueltos
// después — Configuración y Chat quedan afuera de cualquier grupo porque no
// son parte de un flujo de trabajo, son utilitarios que se usan solos.
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "asistencia",
    label: "Asistencia",
    icon: "pin",
    links: [
      { href: "/asistencia", label: "Asistencia", icon: "pin" },
      { href: "/horas", label: "Horas", icon: "timer" },
      { href: "/turnos", label: "Turnos", icon: "clock" },
      { href: "/sucursales", label: "Sucursales y QR", icon: "building" },
    ],
  },
  {
    key: "rrhh",
    label: "RRHH",
    icon: "clipboard",
    links: [
      { href: "/empleados", label: "Empleados", icon: "users" },
      { href: "/rrhh", label: "Panel RRHH", icon: "clipboard" },
      { href: "/puestos", label: "Puestos y Tareas", icon: "briefcase" },
      { href: "/legajos", label: "Legajos", icon: "folder" },
    ],
  },
  {
    key: "produccion",
    label: "Producción",
    icon: "book",
    links: [{ href: "/recetario", label: "Recetario", icon: "book" }],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: "banknote",
    links: [
      { href: "/liquidacion", label: "Liquidación", icon: "banknote" },
      { href: "/escalas", label: "Escalas salariales", icon: "chart" },
      { href: "/adelantos", label: "Adelantos", icon: "wallet" },
      { href: "/caja", label: "Caja", icon: "receipt" },
    ],
  },
];

export const NAV_INICIO: NavLink = { href: "/", label: "Inicio", icon: "home" };

export const NAV_SUELTOS: NavLink[] = [
  { href: "/configuracion", label: "Configuración", icon: "settings" },
  { href: "/chat", label: "Chat", icon: "chat" },
];

export function esActivo(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}

// "Finanzas / Adelantos" para la barra de arriba, a partir de la URL.
export function migaDePan(pathname: string): string | null {
  for (const g of NAV_GROUPS) {
    const link = g.links.find((l) => esActivo(pathname, l.href));
    if (link) return link.label === g.label ? g.label : `${g.label} / ${link.label}`;
  }
  return [NAV_INICIO, ...NAV_SUELTOS].find((l) => esActivo(pathname, l.href))?.label ?? null;
}
