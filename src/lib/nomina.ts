export const NOMINA = [
  "Acevedo Francisco", "Albertengo Damian", "Álvarez Alfredo", "Aquino Karen",
  "Ayora Florencia", "Battochio Benjamín", "Benedetto Roberto", "Benitez Patricia",
  "Biancotti Agustina", "Borja Julian", "Borri Denise", "Cardozo Silvia",
  "Carnevale Aldana", "Castañeda Georgina", "Cavallari María José", "Cristodolou Claudia",
  "Díaz Jorge", "Diep Asef Leila", "Fernández Belén", "Fernandez Sandra",
  "Ferreyra Rocio", "Franco Micaela", "Galasso Leticia", "Garcia Alejandra",
  "García Leandro", "Gomez Ramón Omar", "Gomez Romina", "Herrera Carla",
  "Landini Gabriela", "Longo Daniela", "Mayo Camila Denise", "Núñez Laura",
  "Obuljen Luka", "Obuljen Martina", "Ojeda Lautaro", "Pellegrini David",
  "Pérez José", "Ramirez Vanesa", "Ricardo Villaruel", "Ríos Sandra",
  "Risso Carina", "Rivero Ignacio", "Roberi Mónica Graciela", "Rosas María de los Angeles",
  "Ruiz Diaz Sol Evangelina", "Sanchez Danisa", "Sanchez Romina", "Troncozo Laura",
  "Vallejos Cristian", "Vallejos Gonzalo", "Vallejos Sebastián", "Veron Jenifer",
  "Zubia Samira",
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");
}

export function validarNomina(input: string): string | null {
  const norm = normalizar(input);
  for (const empleado of NOMINA) {
    if (normalizar(empleado) === norm) return empleado;
  }
  return null;
}
