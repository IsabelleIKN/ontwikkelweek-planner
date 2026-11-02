# Ontwikkelweek-planner

Eén bestand: open `index.html` in de browser. Geen installatie, werkt offline.

## Gebruik
1. **Docenten**: namen toevoegen (of importeren uit Excel/CSV), het vaste patroon instellen (O = ochtend, M = middag) en rol/richting markeren (AVO, WEB, AI, XR, GD).
2. **Klassen**: per jaarlaag toevoegen; jaar 2 en 3 met profiel (WEB/GD/XR).
3. **Week**: structuur per groep (jaar 1 gedeeld; jaar 2 en 3 per richting WEB/GD/XR): rooster loopt door of aangepast, en per dag onderwijs / studiedag / excursie / voor-/nazorg. Klassen aan/uit, docenten koppelen per klas × dagdeel. Loopt het rooster door, dan staat er één vak per dag: laat het leeg als er niets aangepast hoeft, of kies wie die dag op de klas staat.
4. **Overzicht**: per klas een weekkaartje met de docenten erop, in kleur (studiedag, excursie, vrij, dubbele inzet). Dit is ook de PDF (Print / PDF) en het eerste tabblad van de Excel-export.
5. **Bezetting**: overzicht per docent. Dubbelboekingen (oranje) en inzet bij niet-beschikbaar (rood) vallen meteen op. Klik op een vak voor een afwijking in die week (cursus, compensatie vrij, extra beschikbaar).
6. **Delen & import**: JSON (volledig, om te delen en weer te importeren), Excel (voor lezen), PDF (via printvenster).

## Werkwijze (staat ook bovenaan het Week-tabblad, afvinkbaar per week)
1. Check met curriculumhouders of er aangepast rooster is of het doorloopt, en stem de algemene invulling van de beroepsuren / inhoud af.
2. Stel data vast voor excursies/andere evenementen en koppel terug naar curriculumhouders.
3. Stel de inzet vast: eerst het doorlopende rooster, daarna het aangepaste. Gebruik AVO-docenten waar mogelijk, zeker bij excursiebegeleiding (ruimte voor beroepsdocenten).
4. Check het overzicht met het team (Teams of teamoverleg) op onverwachte omstandigheden.
5. Pas aan indien nodig en koppel de inzet door naar de roostermaker.

## Afspraken die erin zitten
- Maandag = teamstudiedag, vrijdag = voor-/nazorg (studenten vrij); standaard bij elke nieuwe week, aanpasbaar.
- Een klas kan per dagdeel (of hele dag) "vrij" zijn als dat al in het normale rooster zit: open het vak en vink "Klas heeft vrij" aan. Eerder gekoppelde docenten blijven bewaard als je het weer uitzet.
- In de docentenkeuze filter je op rol/richting en op "alleen nog inzetbaar" (beschikbaar en nog niet elders ingezet). Al gekozen docenten blijven altijd zichtbaar.
- Dubbele inzet geeft een oranje waarschuwing. Is het bewust (bijv. een gezamenlijke les), open dan het vak (of klik de melding aan) en vink "Dubbele inzet is bewust" aan: het vak toont dan ✓ en de melding verdwijnt.
- Aangepast rooster: ochtend 10:00–12:15, pauze 12:15–12:45, middag 12:45–15:00.
- Excursies: docenten koppel je als begeleiders aan het dagdeel.
- Oudere JSON-bestanden (structuur per jaarlaag) worden bij importeren omgezet naar de richtingen.

## Opslag
Gegevens staan in de browser (localStorage), per browser/computer. Delen of back-up: JSON exporteren.

## Bouwen
`python3 src/build.py` voegt `src/` samen tot `index.html`.

## Overdracht
- **Geen afhankelijkheden, geen server.** `index.html` is volledig zelfstandig (ook de Excel-lezer/-schrijver in `src/xlsx-lite.js`).
- **Bron en build:** pas `src/app.js`, `src/style.css` of `src/xlsx-lite.js` aan en draai `python3 src/build.py`; dat schrijft `index.html` opnieuw. Wijzig `index.html` niet rechtstreeks.
- **Gegevens** staan per browser en per bestandslocatie in localStorage (sleutel `ontwikkelweek-planner-v1`). Wie het overneemt begint leeg; gebruik "Alles exporteren (JSON)" en "JSON importeren" onder Delen & import om de huidige stand over te zetten.
- **Datamodel in het kort:** docenten (naam, beschikbaarheid per dag/dagdeel, tags), klassen (jaar, profiel), weken (structuur per groep: jaar 1, en jaar 2/3 per profiel; inzet per klas × dagdeel; afwijkingen per docent; bewust-dubbel-markeringen; afgevinkte stappen). Oudere exports worden bij het laden omgezet.
- **Bewust niet gebouwd:** gedeelde opslag voor meerdere gebruikers tegelijk, en het ophalen van een rooster via webcal/.ics.
