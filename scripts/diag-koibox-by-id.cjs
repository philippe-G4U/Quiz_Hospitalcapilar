#!/usr/bin/env node
// Read-only: print Koibox appointment by id. Usage: node scripts/diag-koibox-by-id.cjs <id>
require('dotenv').config();
const KOIBOX_KEY = process.env.KOIBOX_API_KEY;
const id = process.argv[2];
if (!id) { console.error('Usage: node scripts/diag-koibox-by-id.cjs <id>'); process.exit(1); }
async function main() {
  const r = await fetch(`https://api.koibox.cloud/api/agenda/${id}/`, { headers: { 'X-Koibox-Key': KOIBOX_KEY } });
  console.log('status:', r.status);
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    console.log(JSON.stringify({
      id: j.id,
      fecha: j.fecha,
      hora_inicio: j.hora_inicio,
      hora_fin: j.hora_fin,
      titulo: j.titulo,
      estado: j.estado,
      user: j.user,
      cliente: j.cliente && { id: j.cliente.id, nombre: j.cliente.nombre, email: j.cliente.email, movil: j.cliente.movil, localidad: j.cliente.localidad },
      servicios: (j.servicios || []).map(s => ({ id: s.id || s.value, name: s.name || s.text })),
      notas: j.notas,
    }, null, 2));
  } catch (e) {
    console.log(txt.slice(0, 600));
  }
}
main();
