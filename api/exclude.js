import { handle, fail, body, getMeta } from '../lib/redis.js';

// Teilnehmer können nichts mehr abwählen – das legt nur noch der Organisator fest (api/settings.js).
// Bereits früher gesetzte Teilnehmer-Ausschlüsse bleiben unangetastet und werden bei der Losung weiter beachtet.
export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  await getMeta(String(body(req).id || ''));
  fail(403, 'Das Abwählen übernimmt jetzt der Organisator. Wende dich bei Wünschen bitte an ihn.');
});
