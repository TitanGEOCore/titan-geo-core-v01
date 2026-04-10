import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Badge, Box, Divider, Banner, TextField, ProgressBar,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { authenticate, PRO_PLAN, ENTERPRISE_PLAN } from "../shopify.server";
import prisma from "../db.server";

/* ═══════════════════════════════════════════════════════
   TEMPLATES — 22 vollständige Brand DNA Templates
   ═══════════════════════════════════════════════════════ */
const TEMPLATES = [
  // ── STARTER (frei: Index 0-4) ──
  {
    id: "luxury",
    name: "Luxus & Premium",
    icon: "✨",
    industry: "Luxusgüter",
    tier: "starter",
    description: "Für hochwertige Produkte mit exklusivem Anspruch. Perfekt für Schmuck, Mode, Uhren und Luxusgüter.",
    exampleOutput: "Entdecken Sie die Essenz zeitloser Eleganz – ein Meisterwerk aus 750er Gold, von Hand gefertigt in unserer Genfer Manufaktur.",
    tags: ["Exklusiv", "Elegant", "Hochpreisig"],
    brandVoice: "Exklusiv, elegant, souverän. Spricht eine anspruchsvolle Klientel an, die Wert auf Qualität und Einzigartigkeit legt. Understatement statt Lautstärke. Die Sprache ist gewählt, nie aufdringlich, immer auf Augenhöhe mit dem Kenner. Jedes Wort transportiert Wertigkeit. Metaphern stammen aus der Welt der Handwerkskunst, Architektur und Haute Couture. Emotionen werden subtil geweckt, nie erzwungen. Der Ton ist wie ein perfekt geschnittener Anzug: maßgeschneidert, makellos, zeitlos.",
    targetAudience: "Qualitätsbewusste Käufer, 30-55 Jahre, hohes Einkommen, urban, schätzen Handwerkskunst und Nachhaltigkeit. Beruflich erfolgreich, reisen regelmäßig international, informieren sich über Fachmagazine und kuratierte Plattformen. Kaufentscheidungen basieren auf Materialqualität, Heritage und Markenwerten, nicht auf Preis.",
    noGos: "Keine Rabatt-Sprache, kein 'günstig' oder 'billig', keine Emojis, kein 'Schnäppchen', keine übertriebenen Superlative, kein 'Jetzt zuschlagen', kein 'limitiert nur noch heute', keine Vergleiche mit Discountern, kein Ausrufezeichen-Spam.",
  },
  {
    id: "eco",
    name: "Nachhaltig & Öko",
    icon: "🌿",
    industry: "Nachhaltigkeit",
    tier: "starter",
    description: "Für nachhaltige und umweltbewusste Marken. Ideal für Bio-Produkte, Fair-Trade, Zero-Waste und Upcycling.",
    exampleOutput: "Aus GOTS-zertifizierter Bio-Baumwolle, fair gehandelt in Portugal – weil guter Stil kein schlechtes Gewissen braucht.",
    tags: ["Bio", "Fair-Trade", "Transparent"],
    brandVoice: "Authentisch, transparent, inspirierend. Betont Nachhaltigkeit ohne Greenwashing. Faktenbasiert mit emotionaler Verbindung zur Natur. Jede Aussage ist belegbar, jede Zutat rückverfolgbar. Die Sprache verbindet wissenschaftliche Präzision mit poetischer Naturnähe. Wir erzählen Geschichten von Ursprüngen, Lieferketten und den Menschen, die dahinterstehen.",
    targetAudience: "Umweltbewusste Konsumenten, 25-45 Jahre, urban, gut informiert, bereit mehr für nachhaltige Produkte zu zahlen. Lesen Öko-Test, folgen Nachhaltigkeits-Influencern, sind in lokalen Initiativen aktiv. Hinterfragen Lieferketten, erwarten Zertifizierungen und Transparenzberichte.",
    noGos: "Kein Greenwashing, keine unbelegten Umwelt-Claims, kein 'bio' ohne Zertifizierung, keine Fast-Fashion-Sprache, kein 'umweltfreundlich' ohne Nachweis, keine Plastik-Metaphern, kein 'natürlich' als leeres Buzzword.",
  },
  {
    id: "tech",
    name: "Tech & Innovation",
    icon: "🚀",
    industry: "Technologie",
    tier: "starter",
    description: "Für technische Produkte und Gadgets. Optimal für Elektronik, Software, SaaS und Smart-Home-Geräte.",
    exampleOutput: "Mit dem neuen M4 Ultra Chip und 128 GB Unified Memory – Rendering-Leistung, die Ihren Workflow revolutioniert.",
    tags: ["Innovation", "Specs", "Zukunft"],
    brandVoice: "Präzise, kompetent, zukunftsorientiert. Technische Details verständlich erklärt. Innovation steht im Fokus. Wir übersetzen Komplexität in Klarheit, ohne zu simplifizieren. Specs werden in Nutzwert verwandelt. Der Ton ist der eines vertrauenswürdigen Tech-Beraters: sachlich, begeistert für Fortschritt, immer auf dem neuesten Stand.",
    targetAudience: "Tech-affine Early Adopters, 20-40 Jahre, technikbegeistert, vergleichen gerne Spezifikationen. Lesen Testberichte auf Golem, Heise und The Verge. Erwarten detaillierte Produktdaten, Kompatibilitätsinfos und ehrliche Performance-Angaben.",
    noGos: "Keine falschen technischen Angaben, kein Marketing-Buzzword-Spam, keine Vergleiche mit Konkurrenten, kein 'revolutionär' ohne Substanz, keine erfundenen Benchmark-Werte, kein 'KI-gesteuert' als leeres Label.",
  },
  {
    id: "handmade",
    name: "Handgemacht & Manufaktur",
    icon: "🎨",
    industry: "Kunsthandwerk",
    tier: "starter",
    description: "Für handgefertigte Produkte und Kunsthandwerk. Perfekt für Töpferei, Lederarbeiten, Schmuckdesign und Unikate.",
    exampleOutput: "Jede Schale ist ein Unikat – von Hand gedreht in unserer Berliner Werkstatt, glasiert mit eigenen Rezepturen aus dem 19. Jahrhundert.",
    tags: ["Handarbeit", "Unikate", "Storytelling"],
    brandVoice: "Persönlich, warmherzig, geschichtenerzählend. Betont die Handarbeit, das Material und die Menschen dahinter. Jedes Produkt hat eine Geschichte, jede Naht erzählt von Hingabe. Wir machen den Schaffensprozess sichtbar: vom Rohstoff über die Werkbank bis zum fertigen Stück.",
    targetAudience: "Design-Liebhaber, 28-50 Jahre, schätzen Individualität und Handwerk, kaufen bewusst statt massenhaft. Besuchen Kunstmärkte und Design-Messen, folgen Maker-Szene auf Instagram und Pinterest.",
    noGos: "Keine Massenproduktions-Sprache, kein 'made in China', keine unpersönliche Sprache, kein 'Stückzahl begrenzt' als Druckmittel, keine Stock-Foto-Sprache.",
  },
  {
    id: "food",
    name: "Food & Genuss",
    icon: "🍽️",
    industry: "Lebensmittel",
    tier: "starter",
    description: "Für Lebensmittel, Getränke und Feinkost. Ideal für Kaffee, Wein, Gewürze, Konfitüren und Delikatessen.",
    exampleOutput: "Dieser Single-Origin Arabica aus den Hochlagen Äthiopiens entfaltet Noten von Blaubeere und Jasmin – geröstet in kleinen Chargen für maximale Aromentiefe.",
    tags: ["Sinnlich", "Genuss", "Herkunft"],
    brandVoice: "Sinnlich, appetitanregend, genussvoll. Beschreibt Geschmack, Textur und Herkunft. Weckt Verlangen. Die Sprache ist ein Fest für die Sinne: Wir lassen Aromen tanzen, Texturen knistern und Düfte aufsteigen. Herkunftsgeschichten verbinden Terroir mit Tradition.",
    targetAudience: "Genussmenschen, Foodies, 25-55 Jahre, experimentierfreudig, qualitätsbewusst bei Lebensmitteln. Kochen regelmäßig selbst, besuchen Wochenmärkte und Feinkostläden.",
    noGos: "Keine gesundheitsbezogenen Claims ohne Beleg, keine Allergen-Fehlinformationen, kein 'schmeckt wie', kein 'künstliche Aromen' verschweigen, keine falschen Herkunftsangaben.",
  },
  // ── PRO Templates (Index 5-14) ──
  {
    id: "fitness",
    name: "Sport & Fitness",
    icon: "💪",
    industry: "Sport",
    tier: "pro",
    description: "Für Sport, Fitness und Wellness-Produkte. Optimal für Supplements, Sportbekleidung, Equipment und Trainingspläne.",
    exampleOutput: "Dein neues Whey Isolat: 27g Protein pro Serving, mikrofein gefiltert, unter 1g Zucker – entwickelt mit Sportwissenschaftlern für maximale Absorption.",
    tags: ["Motivation", "Performance", "Community"],
    brandVoice: "Motivierend, energetisch, fachkundig. Spricht die Sprache der Community. Unterstützt Ziele, ohne zu belehren. Performance-Daten treffen auf Motivation. Wir feiern jeden Fortschritt, ob Anfänger oder Profi. Der Ton ist wie ein guter Trainingspartner: pushend aber respektvoll.",
    targetAudience: "Fitness-Enthusiasten, 18-45 Jahre, aktiv, zielorientiert, community-orientiert. Trainieren 3-5 mal pro Woche, tracken ihre Fortschritte, folgen Fitness-Influencern.",
    noGos: "Keine unrealistischen Versprechungen, keine Vorher-Nachher-Garantien, kein Body-Shaming, kein 'ohne Training zum Traumkörper', keine nicht zugelassenen Health-Claims.",
  },
  {
    id: "minimalist",
    name: "Minimalist & Skandinavisch",
    icon: "○",
    industry: "Design",
    tier: "pro",
    description: "Für klare, reduzierte Designs und skandinavisch inspirierte Produkte. Ideal für Möbeldesign, Keramik, Textilien und Lifestyle.",
    exampleOutput: "Klare Linien, massives Eichenholz, eine Funktion: Unser SUND Regal bringt Ruhe in jeden Raum.",
    tags: ["Minimal", "Nordisch", "Klarheit"],
    brandVoice: "Reduziert, klar, poetisch in ihrer Einfachheit. Weniger ist mehr, jedes Wort sitzt. Die Sprache spiegelt das Design: aufgeräumt, durchdacht, ohne Überfluss. Stille Eleganz statt lauter Effekte.",
    targetAudience: "Design-bewusste Minimalisten, 25-45 Jahre, urban, oft in kreativen Berufen. Folgen Design-Blogs wie Dezeen und Kinfolk. Kaufen wenige, aber hochwertige Dinge.",
    noGos: "Keine grellen Farbbeschreibungen, kein visuelles Chaos in der Sprache, keine Superlative, kein 'mega', 'krass' oder 'wahnsinnig', keine überflüssigen Adjektive, kein Ausrufezeichen-Spam.",
  },
  {
    id: "streetwear",
    name: "Streetwear & Urban",
    icon: "🔥",
    industry: "Mode",
    tier: "pro",
    description: "Für Streetwear, Sneaker-Culture, Urban Fashion und Limited Drops. Perfekt für Marken mit Attitude und Community-Fokus.",
    exampleOutput: "Drop 017: Oversized Hoodie in Stone-Washed Black – limitiert auf 200 Pieces. Wenn er weg ist, ist er weg.",
    tags: ["Urban", "Drops", "Culture"],
    brandVoice: "Authentisch, selbstbewusst, kulturell verwurzelt. Spricht die Sprache der Straße ohne sie zu imitieren. Streetwear ist Kultur, nicht Kostüm. Drop-Kultur trifft auf Storytelling, Collabs werden als kulturelle Events inszeniert.",
    targetAudience: "Streetwear-Community, 16-35 Jahre, style-bewusst, kulturell vernetzt. Leben in Großstädten, folgen Hypebeast, Highsnobiety und lokalen Szene-Accounts.",
    noGos: "Keine kulturelle Aneignung ohne Kontext, kein Fake-Slang, keine falschen Limited-Edition-Claims, kein 'streetstyle' für Basic-Mode, kein erzwungenes Jugend-Vokabular.",
  },
  {
    id: "kids",
    name: "Kinderwelt & Family",
    icon: "🧸",
    industry: "Kinder & Baby",
    tier: "pro",
    description: "Für Kinderprodukte, Spielzeug, Babybedarf und Familienmarken. Sicherheit und Freude im Fokus.",
    exampleOutput: "Unser Stapelturm aus FSC-Buchenholz fördert die Feinmotorik ab 12 Monaten – mit abgerundeten Kanten und speichelechter Farbe.",
    tags: ["Sicherheit", "Familie", "Pädagogik"],
    brandVoice: "Warmherzig, vertrauenswürdig, verspielt aber informiert. Spricht Eltern auf Augenhöhe an, nicht von oben herab. Sicherheit und Entwicklungsförderung stehen im Vordergrund, werden aber nicht als Angstmarketing eingesetzt.",
    targetAudience: "Eltern und Großeltern, 25-50 Jahre, sicherheitsbewusst, qualitätsorientiert bei Kinderprodukten. Recherchieren gründlich vor Kaufentscheidungen.",
    noGos: "Kein Angstmarketing gegenüber Eltern, keine übertriebenen Bildungsversprechen, kein 'Ihr Kind wird zum Genie', keine ungeprüften Sicherheitsaussagen, keine Genderstereotypen.",
  },
  {
    id: "beauty",
    name: "Beauty & Skincare",
    icon: "🌸",
    industry: "Kosmetik",
    tier: "pro",
    description: "Für Kosmetik, Hautpflege, Haarpflege und Beauty-Tools. Von Clean Beauty bis Derma-Kosmetik.",
    exampleOutput: "Unser Vitamin-C-Serum mit 15% L-Ascorbinsäure und Ferulasäure – klinisch getestet, sichtbare Ergebnisse nach 4 Wochen.",
    tags: ["Skincare", "Inhaltsstoffe", "Empowerment"],
    brandVoice: "Empowernd, wissensbasiert, sinnlich. Feiert Individualität statt Perfektion. Science meets Self-Care. Inhaltsstoffe werden transparent erklärt, Wirkversprechen sind belegbar.",
    targetAudience: "Beauty-Bewusste aller Geschlechter, 20-50 Jahre, ingredients-informiert, folgen Skinfluencern und Dermatologen auf Social Media.",
    noGos: "Kein 'Anti-Aging' als Angstbotschaft, keine unrealistischen Vorher-Nachher-Versprechen, kein Kolorismus, keine nicht zugelassenen Wirkversprechen, kein Body-Shaming.",
  },
  {
    id: "home",
    name: "Home & Interior",
    icon: "🏠",
    industry: "Wohnen",
    tier: "pro",
    description: "Für Möbel, Wohnaccessoires, Beleuchtung und Interior Design. Vom Industrial-Loft bis zum Landhausstil.",
    exampleOutput: "Der NORDEN Esstisch aus massiver Wildeiche – jede Maserung erzählt eine andere Geschichte. 200 x 100 cm, Platz für die ganze Familie.",
    tags: ["Interior", "Atmosphäre", "Lifestyle"],
    brandVoice: "Inspirierend, atmosphärisch, raumschaffend. Die Sprache gestaltet Räume, noch bevor das Produkt aufgestellt ist. Wir beschreiben nicht nur Möbel, sondern Lebensgefühle.",
    targetAudience: "Home-Design-Enthusiasten, 28-55 Jahre, investieren bewusst in ihre Wohnumgebung. Folgen Architectural Digest, Elle Decoration und Pinterest Interior-Boards.",
    noGos: "Keine falschen Materialangaben, kein 'Echtholz-Optik' ohne Klarstellung, keine unrealistischen Raumfotos ohne Hinweis auf Staging, kein 'passt in jeden Raum' ohne Maßangaben.",
  },
  {
    id: "automotive",
    name: "Automotive & Motorsport",
    icon: "🏎️",
    industry: "Automotive",
    tier: "pro",
    description: "Für Autozubehör, Tuning, Motorsport-Equipment und Fahrzeugpflege. Leistung trifft Leidenschaft.",
    exampleOutput: "Unser Stage-2 Ladeluftkühler für den Golf 8 GTI – 40% mehr Kühlleistung, TÜV-geprüft, inklusive Teilegutachten.",
    tags: ["Performance", "Tuning", "Leidenschaft"],
    brandVoice: "Kraftvoll, präzise, leidenschaftlich. Spricht die Sprache der Petrolheads und Technik-Enthusiasten. PS-Zahlen, Drehmoment und Materialeigenschaften werden mit spürbarer Begeisterung vermittelt.",
    targetAudience: "Auto-Enthusiasten und Motorsport-Fans, 20-55 Jahre, technisch versiert, investieren Zeit und Geld in ihr Fahrzeug. Aktiv in Online-Foren, besuchen Tuning-Treffen.",
    noGos: "Keine falschen Leistungsangaben, keine illegalen Tuning-Empfehlungen, kein Verschweigen von TÜV-Relevanz, kein 'Race-Performance' für Optik-Tuning.",
  },
  // ── ENTERPRISE Templates (Index 12-14) ──
  {
    id: "outdoor",
    name: "Outdoor & Adventure",
    icon: "⛰️",
    industry: "Outdoor",
    tier: "enterprise",
    description: "Für Outdoor-Ausrüstung, Camping, Wandern, Klettern und Expeditions-Gear. Natur und Abenteuer im Herzen.",
    exampleOutput: "Die SUMMIT 3-Lagen-Jacke: 20.000mm Wassersäule, 15.000g/m² Atmungsaktivität – dein Schutzschild von der Tagestour bis zur Alpenüberquerung.",
    tags: ["Abenteuer", "Natur", "Zuverlässig"],
    brandVoice: "Abenteuerlich, zuverlässig, naturverbunden. Die Sprache riecht nach Lagerfeuer und klingt nach Gipfelsturm. Wir sprechen aus Erfahrung: Jedes Produkt wurde gedanklich auf dem Trail getestet.",
    targetAudience: "Outdoor-Enthusiasten und Abenteurer, 22-55 Jahre, aktiv in der Natur, von Wochenend-Wanderern bis Expeditions-Profis.",
    noGos: "Keine falschen Wetterschutz-Angaben, keine übertriebenen Temperaturversprechen, kein 'wasserdicht' ohne Wassersäulen-Angabe, keine Verharmlosung von alpinen Gefahren.",
  },
  {
    id: "vintage",
    name: "Vintage & Retro",
    icon: "📻",
    industry: "Vintage",
    tier: "enterprise",
    description: "Für Vintage-Mode, Retro-Elektronik, Antiquitäten und nostalgische Produkte. Zeitreise durch Stil und Qualität.",
    exampleOutput: "Original Levi's 501 aus den 80ern – stone-washed, authentische Patina, made in USA. Ein Stück Denim-Geschichte für deinen Schrank.",
    tags: ["Nostalgie", "Authentisch", "Kuratiert"],
    brandVoice: "Nostalgisch, geschichtenreich, kuratiert. Die Sprache ist eine Zeitmaschine, die vergangene Epochen lebendig macht. Jedes Stück trägt Geschichte in sich.",
    targetAudience: "Vintage-Liebhaber und Retro-Fans, 22-55 Jahre, stilbewusst mit Faible für vergangene Epochen. Besuchen Flohmärkte, Vintage-Märkte und Second-Hand-Läden.",
    noGos: "Keine falschen Epochen-Zuordnungen, kein 'Vintage-Style' für Neuware ohne Kennzeichnung, keine Echtheitsbetrügereien, kein Verschweigen von Gebrauchsspuren.",
  },
  {
    id: "medical",
    name: "Medical & Pharma",
    icon: "⚕️",
    industry: "Gesundheit",
    tier: "enterprise",
    description: "Für medizinische Produkte, Nahrungsergänzung, Gesundheitsgeräte und Pharma-Produkte. Vertrauen durch Evidenz.",
    exampleOutput: "Unser Magnesium-Bisglycinat mit 400mg elementarem Mg pro Tagesdosis – 3 klinische Studien belegen die überlegene Bioverfügbarkeit.",
    tags: ["Evidenzbasiert", "Vertrauen", "Reguliert"],
    brandVoice: "Wissenschaftlich fundiert, vertrauenswürdig, klar. Die Sprache baut Brücken zwischen Fachwelt und Patient. Komplexe medizinische Zusammenhänge werden verständlich erklärt, ohne zu vereinfachen.",
    targetAudience: "Gesundheitsbewusste Verbraucher und medizinisches Fachpersonal, 25-65 Jahre, recherchieren gründlich, lesen Studien und Fachinformationen.",
    noGos: "Keine nicht zugelassenen Heilversprechen, keine falschen Studien-Referenzen, kein 'heilt' oder 'garantiert Wirkung', keine Diagnose-Ersatz-Ansprüche.",
  },
  // ── NEUE Templates (Index 15-21) ──
  {
    id: "pet",
    name: "Pet & Tierbedarf",
    icon: "🐾",
    industry: "Tierbedarf",
    tier: "pro",
    description: "Für Tiernahrung, Zubehör, Pflege und alles rund um Haustiere. Die Sprache der Tierliebhaber.",
    exampleOutput: "Unser Nassfutter mit 70% frischem Hühnchen in Lebensmittelqualität – getreidefrei, ohne Lockstoffe, von Tierärzten empfohlen.",
    tags: ["Tierliebe", "Qualität", "Gesundheit"],
    brandVoice: "Liebevoll, kompetent, emotional. Spricht Tierbesitzer als verantwortungsvolle Familienmitglieder an. Produkte werden aus der Perspektive des Tierwohls beschrieben. Inhaltsstoffe transparent, Herkunft nachvollziehbar. Der Ton ist wie ein Gespräch beim Tierarzt des Vertrauens: fachkundig, einfühlsam, ehrlich.",
    targetAudience: "Tierbesitzer aller Altersgruppen, emotional gebunden an ihre Haustiere, bereit für Qualität mehr zu zahlen. Informieren sich über Inhaltsstoffe, lesen Tierarzt-Blogs, teilen Haustierfotos in Communities.",
    noGos: "Keine Vermenschlichung bis zur Lächerlichkeit, keine unbelegten Gesundheits-Claims, kein Verschweigen von Inhaltsstoffen, keine falschen Fütterungsempfehlungen, kein Herabsetzen anderer Tierhalter.",
  },
  {
    id: "travel",
    name: "Reisen & Tourismus",
    icon: "✈️",
    industry: "Reisen",
    tier: "enterprise",
    description: "Für Reisezubehör, Koffer, Reise-Gadgets und Tourismus-Produkte. Fernweh zum Anfassen.",
    exampleOutput: "Der VOYAGER Cabin-Trolley: 55x40x20cm Handgepäckmaß, Polycarbonat-Schale, TSA-Schloss – dein zuverlässiger Begleiter von Berlin bis Bali.",
    tags: ["Fernweh", "Qualität", "Abenteuer"],
    brandVoice: "Inspirierend, weltgewandt, praktisch. Verbindet Reise-Sehnsucht mit handfesten Produktinfos. Die Sprache öffnet Horizonte und macht Lust auf Aufbruch. Produktdetails werden in Reiseszenarien eingebettet: vom Backpacking bis Business-Trip.",
    targetAudience: "Reisebegeisterte, 22-60 Jahre, von Budget-Backpackern bis Luxusreisenden. Planen Trips akribisch, lesen Reiseblogs, vergleichen Equipment. Erwarten Maßangaben, Gewichtsdaten und Praxistauglichkeit.",
    noGos: "Keine falschen Maßangaben, keine unrealistischen Gewichtsversprechen, kein Kulturklischee-Marketing, keine Verharmlosung von Reiserisiken, kein 'passt als Handgepäck' ohne Airline-Kontext.",
  },
  {
    id: "education",
    name: "Bildung & E-Learning",
    icon: "📚",
    industry: "Bildung",
    tier: "enterprise",
    description: "Für Lernmaterialien, Online-Kurse, Bücher und Bildungstechnologie. Wissen zugänglich machen.",
    exampleOutput: "Unser interaktiver Python-Kurs: 120 Praxisübungen, Live-Code-Editor, persönliches Feedback – vom Anfänger zum Junior Developer in 12 Wochen.",
    tags: ["Wissen", "Didaktik", "Empowerment"],
    brandVoice: "Didaktisch, ermutigend, klar strukturiert. Komplexes wird zugänglich, ohne herablassend zu sein. Lernfortschritt wird gefeiert, Hürden werden als Teil des Weges normalisiert. Die Sprache ist wie ein exzellenter Lehrer: geduldig, begeisternd, immer ein Schritt voraus.",
    targetAudience: "Lernwillige aller Altersgruppen, von Schülern bis Berufstätige in Weiterbildung. Schätzen strukturierte Lernpfade, Praxisbezug und messbaren Fortschritt.",
    noGos: "Keine unrealistischen Erfolgsversprechen, kein 'ohne Vorkenntnisse zum Experten', keine Herabsetzung anderer Lernwege, keine falschen Zertifizierungsversprechen.",
  },
  {
    id: "music",
    name: "Musik & Instrumente",
    icon: "🎵",
    industry: "Musik",
    tier: "pro",
    description: "Für Musikinstrumente, Audio-Equipment, Zubehör und Studio-Gear. Sound zum Anfassen.",
    exampleOutput: "Die STRAT Classic mit Erle-Body und handgewickelten Pickups – der warme, glasige Clean-Sound, der Nashville zur Legende machte.",
    tags: ["Sound", "Handwerk", "Passion"],
    brandVoice: "Leidenschaftlich, fachkundig, sinnlich im akustischen Sinne. Klang wird fühlbar gemacht: Wärme, Brillanz, Attack, Sustain werden als Erlebnisse beschrieben. Technische Specs treffen auf musikalische Poesie. Der Ton ist wie ein Jam mit Profis: kompetent, inspirierend, voller Respekt für das Handwerk.",
    targetAudience: "Musiker aller Level, 16-60 Jahre, von Hobby-Gitarristen bis Studio-Profis. Lesen Testberichte in Amazona und Sound&Recording, vergleichen Specs, schätzen Klangbeispiele.",
    noGos: "Keine falschen Klangversprechen, keine erfundenen Promi-Endorsements, kein 'klingt wie [Markenname]' ohne Beleg, keine Verschleierung von Herkunft und Materialien.",
  },
  {
    id: "gaming",
    name: "Gaming & eSports",
    icon: "🎮",
    industry: "Gaming",
    tier: "pro",
    description: "Für Gaming-Peripherie, Merchandise, Streaming-Equipment und eSports-Gear. Level up your setup.",
    exampleOutput: "Die APEX Pro Maus: PixArt PAW3395 Sensor, 26.000 DPI, 56g Gewicht – Millisekunden-Vorteil in jedem Ranked Match.",
    tags: ["Performance", "Community", "eSports"],
    brandVoice: "Kompetitiv, community-nah, technisch präzise. Spricht die Sprache der Gamer ohne cringe zu sein. Specs werden in In-Game-Vorteile übersetzt. Die Sprache kennt den Unterschied zwischen Casual und Competitive. Memes und Szene-Sprache werden dosiert eingesetzt.",
    targetAudience: "Gamer und eSports-Fans, 14-35 Jahre, tech-affin, verbringen täglich mehrere Stunden mit Gaming. Folgen Streamern auf Twitch, sind auf Discord aktiv, vergleichen Hardware-Specs akribisch.",
    noGos: "Keine toxische Sprache, kein Pay-to-Win-Vokabular, keine falschen Latenz-Angaben, kein Gatekeeping, keine Herabsetzung von Casual-Gamern, keine falschen eSports-Partnerships.",
  },
  {
    id: "wedding",
    name: "Hochzeit & Events",
    icon: "💍",
    industry: "Events",
    tier: "enterprise",
    description: "Für Hochzeitsdeko, Brautmode, Eventbedarf und festliche Anlässe. Der schönste Tag verdient die schönsten Worte.",
    exampleOutput: "Unsere handkalligraphierten Tischkarten aus Büttenpapier – jeder Name ein kleines Kunstwerk, das Ihre Gäste als Erinnerung mit nach Hause nehmen.",
    tags: ["Emotion", "Eleganz", "Einmaligkeit"],
    brandVoice: "Emotional, elegant, detailverliebt. Jeder Artikel wird als Teil eines einzigartigen Moments beschrieben. Die Sprache feiert Liebe, Zusammengehörigkeit und die Magie besonderer Anlässe. Produktdetails werden in Traumszenarien eingebettet.",
    targetAudience: "Verlobte, Hochzeitsplaner und Eventorganisatoren, 25-45 Jahre. Planen monatelang, haben klare ästhetische Vorstellungen, sind bereit für den perfekten Moment zu investieren.",
    noGos: "Kein Budgetshaming, keine Panikverkaufs-Taktiken, kein 'Ihr Fest wird eine Katastrophe ohne', keine Stereotypen über Geschlechterrollen bei Hochzeiten, keine falschen Materialangaben.",
  },
  {
    id: "garden",
    name: "Garten & Pflanzen",
    icon: "🌱",
    industry: "Garten",
    tier: "pro",
    description: "Für Gartenbedarf, Pflanzen, Samen, Werkzeuge und Outdoor-Möbel. Grüner Daumen trifft gute Beratung.",
    exampleOutput: "Unsere torffreie Bio-Erde mit Mykorrhiza-Pilzen – für kräftige Wurzeln und blühende Beete vom Balkonkasten bis zum Gemüsegarten.",
    tags: ["Natur", "Beratung", "Saison"],
    brandVoice: "Naturverbunden, beratend, saisonal. Die Sprache wächst mit dem Garten: Frühling bringt Aufbruchsstimmung, Herbst Erntefreude. Pflegetipps sind praxisnah, Produktinfos werden mit Gärtnerwissen verknüpft. Der Ton ist wie ein Gespräch über den Gartenzaun: herzlich, hilfsbereit, voller Erfahrung.",
    targetAudience: "Hobbygärtner und Pflanzenliebhaber, 30-65 Jahre, von Balkon-Gärtnern bis Selbstversorger. Folgen Garten-Influencern, besuchen Gartencenter regelmäßig, tauschen sich in Foren aus.",
    noGos: "Keine falschen Winterhärte-Angaben, keine unrealistischen Wachstumsversprechen, kein Verschweigen von Giftigkeit für Kinder/Haustiere, keine chemischen Empfehlungen ohne Hinweis auf Bio-Alternativen.",
  },
  {
    id: "office",
    name: "Büro & Produktivität",
    icon: "💼",
    industry: "Bürobedarf",
    tier: "enterprise",
    description: "Für Büromöbel, Schreibwaren, Organisationssysteme und Produktivitäts-Tools. Effizient arbeiten, besser fühlen.",
    exampleOutput: "Der ERGO One Bürostuhl: Lordosenstütze, 4D-Armlehnen, Synchronmechanik – 8 Stunden Sitzkomfort, entwickelt mit Orthopäden.",
    tags: ["Ergonomie", "Produktivität", "Qualität"],
    brandVoice: "Sachlich, lösungsorientiert, ergonomie-bewusst. Produkte werden als Werkzeuge für besseres Arbeiten positioniert. Technische Details wie Sitzhöhe, Belastbarkeit und Zertifizierungen stehen im Fokus. Der Ton ist professionell aber nicht steril, wie ein guter Büroausstatter: kompetent, ehrlich, an langfristiger Zufriedenheit interessiert.",
    targetAudience: "Berufstätige, Freelancer und Unternehmen, 25-55 Jahre. Verbringen 6-10 Stunden am Schreibtisch, leiden teils unter Rückenproblemen, investieren in ergonomische Ausstattung.",
    noGos: "Keine falschen Ergonomie-Versprechen, keine unbelegten Gesundheits-Claims, keine unrealistischen Produktivitätssteigerungen, kein 'für alle Körpergrößen' ohne Angabe des Verstellbereichs.",
  },
];

const FREE_LIMIT = 5;

/* ═══════════════════════════════════════════════════════
   Quiz-Daten für Tab 2 — Eigene erstellen
   ═══════════════════════════════════════════════════════ */
const QUIZ_INDUSTRIES = [
  { id: "mode", label: "Mode & Bekleidung", icon: "👗" },
  { id: "elektronik", label: "Elektronik & Technik", icon: "💻" },
  { id: "lebensmittel", label: "Lebensmittel & Getränke", icon: "🍽️" },
  { id: "gesundheit", label: "Gesundheit & Wellness", icon: "💚" },
  { id: "hausgarten", label: "Haus & Garten", icon: "🏡" },
  { id: "sport", label: "Sport & Freizeit", icon: "⚽" },
  { id: "beauty", label: "Beauty & Pflege", icon: "🌸" },
  { id: "kinder", label: "Kinder & Baby", icon: "🧸" },
  { id: "tierbedarf", label: "Tierbedarf", icon: "🐾" },
  { id: "schmuck", label: "Schmuck & Accessoires", icon: "💎" },
  { id: "auto", label: "Auto & Motorrad", icon: "🚗" },
  { id: "kunst", label: "Kunst & Handwerk", icon: "🎨" },
  { id: "reisen", label: "Reisen & Tourismus", icon: "✈️" },
  { id: "bildung", label: "Bildung & Kurse", icon: "📚" },
  { id: "gaming", label: "Gaming & eSports", icon: "🎮" },
  { id: "musik", label: "Musik & Audio", icon: "🎵" },
  { id: "andere", label: "Andere Branche", icon: "🏪" },
];

const QUIZ_STYLES = [
  { id: "elegant", label: "Elegant", icon: "🎩", desc: "Stilvoll, gehoben, zeitlos" },
  { id: "laessig", label: "Lässig", icon: "😎", desc: "Entspannt, nahbar, cool" },
  { id: "professionell", label: "Professionell", icon: "📊", desc: "Sachlich, kompetent, seriös" },
  { id: "verspielt", label: "Verspielt", icon: "🎪", desc: "Kreativ, bunt, überraschend" },
  { id: "minimalistisch", label: "Minimalistisch", icon: "◻️", desc: "Klar, reduziert, ruhig" },
  { id: "luxurioes", label: "Luxuriös", icon: "👑", desc: "Exklusiv, premium, opulent" },
];

const QUIZ_CUSTOMERS = [
  { id: "studenten", label: "Studenten", icon: "🎓" },
  { id: "berufstaetige", label: "Berufstätige", icon: "💼" },
  { id: "familien", label: "Familien", icon: "👨‍👩‍👧‍👦" },
  { id: "senioren", label: "Senioren", icon: "🧓" },
  { id: "sportler", label: "Sportler", icon: "🏃" },
  { id: "kreative", label: "Kreative", icon: "🎨" },
];

const QUIZ_VALUES = [
  { id: "qualitaet", label: "Qualität", icon: "⭐" },
  { id: "nachhaltigkeit", label: "Nachhaltigkeit", icon: "🌍" },
  { id: "innovation", label: "Innovation", icon: "💡" },
  { id: "tradition", label: "Tradition", icon: "🏛️" },
  { id: "preisleistung", label: "Preis-Leistung", icon: "💰" },
  { id: "exklusivitaet", label: "Exklusivität", icon: "💎" },
];

const QUIZ_NOGOS_PRESETS = [
  "Keine Emojis", "Kein Duzen", "Keine Anglizismen", "Keine Rabatt-Sprache",
  "Keine Superlative", "Kein Gendern", "Keine Fachsprache", "Keine Umgangssprache",
  "Kein Ausrufezeichen-Spam", "Keine FOMO-Taktiken", "Keine Vergleiche mit Konkurrenten",
  "Keine unbelegten Claims", "Keine Emojis in Titeln", "Kein Clickbait",
];

/* ═══════════════════════════════════════════════════════
   Loader / Action
   ═══════════════════════════════════════════════════════ */
export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.findUnique({ where: { shop: session.shop } });

  let currentPlan = "Starter";
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PRO_PLAN, ENTERPRISE_PLAN],
      isTest: process.env.NODE_ENV !== "production",
    });
    if (hasActivePayment && appSubscriptions?.length > 0) {
      const sub = appSubscriptions[0];
      if (sub.name === ENTERPRISE_PLAN) currentPlan = "Enterprise";
      else if (sub.name === PRO_PLAN) currentPlan = "Pro";
    }
  } catch (e) {
    console.error("Billing check failed:", e);
  }

  // Gespeicherte Custom Templates aus brandVoice parsen (JSON-Array)
  let customTemplates = [];
  let activeTemplateName = "";
  if (settings?.brandVoice) {
    // Aktives Template erkennen: prüfe ob brandVoice einem bekannten Template entspricht
    const matchedTemplate = TEMPLATES.find(t => t.brandVoice === settings.brandVoice);
    if (matchedTemplate) {
      activeTemplateName = matchedTemplate.id;
    }
  }

  // Custom Templates und aktive NoGos aus noGos-Feld lesen
  const rawNoGos = settings?.noGos || "";
  const parsed = parseNoGosField(rawNoGos);
  customTemplates = parsed.customTemplates;
  const activeNoGos = parsed.activeNoGos;

  return json({
    shop: session.shop,
    currentVoice: settings?.brandVoice || "",
    currentAudience: settings?.targetAudience || "",
    currentNoGos: activeNoGos || "",
    currentPlan,
    activeTemplateName,
    customTemplates,
  });
};

// Hilfsfunktionen zum Lesen/Schreiben des kombinierten noGos-Felds
function parseNoGosField(rawNoGos) {
  const result = { customTemplates: [], activeNoGos: rawNoGos || "" };
  if (rawNoGos && rawNoGos.startsWith("[[CUSTOM_TEMPLATES]]")) {
    const activeMarker = "[[ACTIVE_NOGOS]]";
    const activeIdx = rawNoGos.indexOf(activeMarker);
    let customPart = "";
    if (activeIdx !== -1) {
      customPart = rawNoGos.substring("[[CUSTOM_TEMPLATES]]".length, activeIdx);
      result.activeNoGos = rawNoGos.substring(activeIdx + activeMarker.length);
    } else {
      customPart = rawNoGos.replace("[[CUSTOM_TEMPLATES]]", "");
      result.activeNoGos = "";
    }
    try { result.customTemplates = JSON.parse(customPart); } catch (e) { /* ignore */ }
  }
  return result;
}

function buildNoGosField(customTemplates, activeNoGos) {
  if (customTemplates && customTemplates.length > 0) {
    return "[[CUSTOM_TEMPLATES]]" + JSON.stringify(customTemplates) + "[[ACTIVE_NOGOS]]" + (activeNoGos || "");
  }
  return activeNoGos || "";
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const settings = await prisma.shopSettings.findUnique({ where: { shop: session.shop } });

  // Template anwenden (vorgefertigt)
  if (intent === "applyTemplate") {
    const templateId = formData.get("templateId");
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return json({ error: "Template nicht gefunden" });

    // BUGFIX: Custom Templates beibehalten UND die korrekten template.noGos speichern.
    // Vorher wurde bei vorhandenen Custom Templates der gesamte Custom-Templates-JSON
    // statt der eigentlichen noGos gespeichert.
    const { customTemplates: existingCustom } = parseNoGosField(settings?.noGos || "");
    const noGosToSave = buildNoGosField(existingCustom, template.noGos);

    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: {
        brandVoice: template.brandVoice,
        targetAudience: template.targetAudience,
        noGos: noGosToSave,
      },
      create: {
        shop: session.shop,
        brandVoice: template.brandVoice,
        targetAudience: template.targetAudience,
        noGos: noGosToSave,
      },
    });

    return json({ success: true, applied: templateId, message: `Template "${template.name}" aktiviert!` });
  }

  // Custom Brand DNA generieren via Gemini
  if (intent === "generateCustom") {
    const quizData = JSON.parse(formData.get("quizData") || "{}");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "templates");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json({ error: "Gemini API Key nicht konfiguriert." });

    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey });

    const prompt = `Du bist ein Brand-Strategie-Experte. Erstelle eine vollständige Brand DNA auf Deutsch basierend auf folgenden Angaben:

Branche: ${quizData.industry || "Nicht angegeben"}
Stil: ${quizData.style || "Nicht angegeben"}
Kunden: ${(quizData.customers || []).join(", ")}
Altersrange: ${quizData.ageMin || 18}-${quizData.ageMax || 65} Jahre
Ansprache: ${quizData.ansprache === "du" ? "Duzen" : "Siezen"}
Tonfall-Formalität: ${quizData.formalitaet || 50}/100 (0=sehr formell, 100=sehr locker)
Wichtige Werte: ${(quizData.values || []).join(", ")}
No-Gos: ${(quizData.noGos || []).join(", ")}${quizData.customNoGos ? ", " + quizData.customNoGos : ""}
Geschäftsbeschreibung: ${quizData.businessDesc || "Nicht angegeben"}

Erstelle eine Brand DNA mit genau diesen drei Feldern als JSON:
- brandVoice: Eine ausführliche Beschreibung der Markenstimme (mindestens 4 Sätze, sehr detailliert)
- targetAudience: Eine detaillierte Zielgruppenbeschreibung (mindestens 4 Sätze)
- noGos: Eine umfassende Liste von Verboten und Einschränkungen (mindestens 6 Punkte, kommagetrennt)

Antworte ausschließlich mit validem JSON. Keine Erklärungen.`;

    try {
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              brandVoice: { type: "string" },
              targetAudience: { type: "string" },
              noGos: { type: "string" },
            },
            required: ["brandVoice", "targetAudience", "noGos"],
          },
          temperature: 0.7,
        },
      });

      const result = JSON.parse(response.text);
      trackUsage(session.shop, "templates");
      return json({ success: true, generated: result, message: "Brand DNA erfolgreich generiert!" });
    } catch (err) {
      console.error("Gemini Fehler:", err);
      return json({ error: "Fehler bei der KI-Generierung. Bitte versuche es erneut." });
    }
  }

  // Custom Template speichern
  if (intent === "saveCustomTemplate") {
    const name = formData.get("name");
    const brandVoice = formData.get("brandVoice");
    const targetAudience = formData.get("targetAudience");
    const noGos = formData.get("noGos");

    // Bestehende Custom Templates und aktive NoGos laden
    const { customTemplates, activeNoGos } = parseNoGosField(settings?.noGos || "");

    const newTemplate = {
      id: "custom_" + Date.now(),
      name: name || "Mein Template",
      brandVoice,
      targetAudience,
      noGos,
      createdAt: new Date().toISOString(),
    };
    customTemplates.push(newTemplate);

    const serialized = buildNoGosField(customTemplates, activeNoGos);

    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: { noGos: serialized },
      create: { shop: session.shop, brandVoice: brandVoice, targetAudience: targetAudience, noGos: serialized },
    });

    return json({ success: true, savedTemplate: newTemplate, message: `Template "${name}" gespeichert!` });
  }

  // Custom Template anwenden
  if (intent === "applyCustomTemplate") {
    const brandVoice = formData.get("brandVoice");
    const targetAudience = formData.get("targetAudience");
    const templateNoGos = formData.get("templateNoGos");

    // BUGFIX: Custom Templates beibehalten UND die korrekten templateNoGos speichern
    const { customTemplates: existingCustom } = parseNoGosField(settings?.noGos || "");
    const noGosToSave = buildNoGosField(existingCustom, templateNoGos);

    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: {
        brandVoice,
        targetAudience,
        noGos: noGosToSave,
      },
      create: {
        shop: session.shop,
        brandVoice,
        targetAudience,
        noGos: noGosToSave,
      },
    });

    return json({ success: true, message: "Custom Template aktiviert!" });
  }

  // Custom Template löschen
  if (intent === "deleteCustomTemplate") {
    const templateId = formData.get("templateId");

    const { customTemplates, activeNoGos } = parseNoGosField(settings?.noGos || "");
    const filtered = customTemplates.filter(t => t.id !== templateId);
    const serialized = buildNoGosField(filtered, activeNoGos);

    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: { noGos: serialized },
      create: { shop: session.shop, brandVoice: "", targetAudience: "", noGos: serialized },
    });

    return json({ success: true, deleted: templateId, message: "Template gelöscht!" });
  }

  // Custom Template bearbeiten
  if (intent === "editCustomTemplate") {
    const templateId = formData.get("templateId");
    const name = formData.get("name");
    const brandVoice = formData.get("brandVoice");
    const targetAudience = formData.get("targetAudience");
    const noGos = formData.get("noGos");

    const { customTemplates, activeNoGos } = parseNoGosField(settings?.noGos || "");
    const updated = customTemplates.map(t =>
      t.id === templateId
        ? { ...t, name: name || t.name, brandVoice, targetAudience, noGos, updatedAt: new Date().toISOString() }
        : t
    );
    const serialized = buildNoGosField(updated, activeNoGos);

    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: { noGos: serialized },
      create: { shop: session.shop, brandVoice: "", targetAudience: "", noGos: serialized },
    });

    return json({ success: true, editedTemplate: { id: templateId, name, brandVoice, targetAudience, noGos }, message: `Template "${name}" aktualisiert!` });
  }

  return json({ error: "Unbekannte Aktion" });
};

/* ═══════════════════════════════════════════════════════
   Styles (Inline-Objekte)
   ═══════════════════════════════════════════════════════ */
const S = {
  tabBar: {
    display: "flex",
    gap: "6px",
    padding: "6px",
    background: "linear-gradient(135deg, #f0f0ff 0%, #e8f4f8 100%)",
    borderRadius: "16px",
    marginBottom: "24px",
    border: "1px solid rgba(99, 102, 241, 0.1)",
  },
  tabPill: (active) => ({
    flex: 1,
    padding: "12px 20px",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: active ? 700 : 500,
    color: active ? "#fff" : "#4b5563",
    background: active ? "linear-gradient(135deg, #6366f1, #06b6d4)" : "transparent",
    boxShadow: active ? "0 4px 12px rgba(99, 102, 241, 0.3)" : "none",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    textAlign: "center",
    letterSpacing: active ? "0.3px" : "0",
  }),
  templateCard: (isActive, locked) => ({
    background: isActive
      ? "linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)"
      : locked ? "linear-gradient(145deg, #f9fafb 0%, #f3f4f6 100%)" : "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
    border: isActive
      ? "2px solid #10b981"
      : locked ? "1px solid #e5e7eb" : "1px solid rgba(99, 102, 241, 0.12)",
    borderRadius: "16px",
    padding: "20px",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    cursor: locked ? "default" : "pointer",
    opacity: locked ? 0.65 : 1,
    position: "relative",
    overflow: "hidden",
  }),
  templateCardHover: {
    boxShadow: "0 8px 24px rgba(99, 102, 241, 0.15)",
    transform: "translateY(-2px)",
  },
  activeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 10px",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #10b981, #059669)",
    color: "#fff",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  tierBadge: (tier) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    padding: "2px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
    background: tier === "enterprise"
      ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
      : tier === "pro"
        ? "linear-gradient(135deg, #818cf8, #6366f1)"
        : "linear-gradient(135deg, #6ee7b7, #34d399)",
    color: "#fff",
  }),
  quizCard: {
    background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
    borderRadius: "20px",
    padding: "40px 32px",
    border: "1px solid rgba(99, 102, 241, 0.1)",
    boxShadow: "0 4px 20px rgba(99, 102, 241, 0.08)",
    minHeight: "400px",
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  quizOptionCard: (selected) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px 12px",
    borderRadius: "14px",
    border: selected ? "2px solid #6366f1" : "1px solid #e5e7eb",
    background: selected ? "linear-gradient(135deg, #ede9fe, #ddd6fe)" : "#fff",
    cursor: "pointer",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    minWidth: "110px",
    textAlign: "center",
    boxShadow: selected ? "0 4px 12px rgba(99, 102, 241, 0.2)" : "0 1px 3px rgba(0,0,0,0.05)",
  }),
  quizOptionCardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.15)",
  },
  chipButton: (selected, color = "indigo") => {
    const colors = {
      indigo: { border: "#6366f1", bg: "linear-gradient(135deg, #ede9fe, #ddd6fe)", text: "#6d28d9" },
      red: { border: "#ef4444", bg: "linear-gradient(135deg, #fef2f2, #fecaca)", text: "#dc2626" },
      green: { border: "#10b981", bg: "linear-gradient(135deg, #ecfdf5, #d1fae5)", text: "#059669" },
    };
    const c = colors[color] || colors.indigo;
    return {
      padding: "8px 16px",
      borderRadius: "24px",
      border: selected ? `2px solid ${c.border}` : "1px solid #d1d5db",
      background: selected ? c.bg : "#fff",
      color: selected ? c.text : "#374151",
      fontSize: "13px",
      fontWeight: selected ? 600 : 400,
      cursor: "pointer",
      transition: "all 0.2s ease",
      whiteSpace: "nowrap",
    };
  },
  progressBar: {
    width: "100%",
    height: "6px",
    borderRadius: "3px",
    background: "#e5e7eb",
    overflow: "hidden",
    marginBottom: "24px",
  },
  progressFill: (pct) => ({
    width: `${pct}%`,
    height: "100%",
    borderRadius: "3px",
    background: "linear-gradient(90deg, #6366f1, #06b6d4)",
    transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
  }),
  navButton: (variant = "default") => ({
    padding: "10px 24px",
    borderRadius: "10px",
    border: variant === "primary" ? "none" : "1px solid #d1d5db",
    background: variant === "primary" ? "linear-gradient(135deg, #6366f1, #06b6d4)" : "#fff",
    color: variant === "primary" ? "#fff" : "#374151",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  }),
  sectionTitle: {
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "#6366f1",
    marginBottom: "4px",
  },
  tagChip: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "12px",
    background: "rgba(99, 102, 241, 0.08)",
    color: "#6366f1",
    fontSize: "11px",
    fontWeight: 500,
  },
  customTemplateCard: (isActive) => ({
    background: isActive
      ? "linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)"
      : "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
    border: isActive ? "2px solid #10b981" : "1px solid rgba(99, 102, 241, 0.12)",
    borderRadius: "16px",
    padding: "20px",
    transition: "all 0.3s ease",
  }),
};

/* ═══════════════════════════════════════════════════════
   Hauptkomponente
   ═══════════════════════════════════════════════════════ */
export default function Templates() {
  const {
    currentVoice, currentAudience, currentNoGos, currentPlan,
    activeTemplateName, customTemplates: serverCustomTemplates,
  } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [selectedTab, setSelectedTab] = useState(0);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [activeId, setActiveId] = useState(activeTemplateName);
  const [customTemplates, setCustomTemplates] = useState(serverCustomTemplates || []);

  // Quiz State
  const [quizStep, setQuizStep] = useState(0);
  const [quizData, setQuizData] = useState({
    industry: "",
    style: "",
    customers: [],
    ageMin: 18,
    ageMax: 65,
    ansprache: "du",
    formalitaet: 50,
    values: [],
    noGos: [],
    customNoGos: "",
    businessDesc: "",
  });
  const [generatedDNA, setGeneratedDNA] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Edit Template State
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", brandVoice: "", targetAudience: "", noGos: "" });

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
      if (actionData.generated) {
        setGeneratedDNA(actionData.generated);
        setQuizStep(7); // finale Vorschau
        setIsGenerating(false);
      }
      if (actionData.applied) {
        setActiveId(actionData.applied);
      }
      if (actionData.savedTemplate) {
        setCustomTemplates(prev => [...prev, actionData.savedTemplate]);
        setSelectedTab(2); // zu Meine Templates wechseln
      }
      if (actionData.deleted) {
        setCustomTemplates(prev => prev.filter(t => t.id !== actionData.deleted));
      }
      if (actionData.editedTemplate) {
        setCustomTemplates(prev => prev.map(t =>
          t.id === actionData.editedTemplate.id ? { ...t, ...actionData.editedTemplate } : t
        ));
        setEditingTemplate(null);
        setEditForm({ name: "", brandVoice: "", targetAudience: "", noGos: "" });
      }
    }
    if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
      setIsGenerating(false);
    }
  }, [actionData]);

  // TODO: Proper plan-based gating will be added later. For now all templates are accessible during development.
  const canAccess = useCallback((template, index) => {
    return true;
  }, []);

  /* ── Handlers ── */
  const handleApplyTemplate = (templateId) => {
    const fd = new FormData();
    fd.set("intent", "applyTemplate");
    fd.set("templateId", templateId);
    submit(fd, { method: "post" });
  };

  const handleGenerateCustom = () => {
    setIsGenerating(true);
    const fd = new FormData();
    fd.set("intent", "generateCustom");
    fd.set("quizData", JSON.stringify(quizData));
    submit(fd, { method: "post" });
  };

  const handleSaveCustomTemplate = () => {
    if (!generatedDNA || !templateName.trim()) return;
    const fd = new FormData();
    fd.set("intent", "saveCustomTemplate");
    fd.set("name", templateName.trim());
    fd.set("brandVoice", generatedDNA.brandVoice);
    fd.set("targetAudience", generatedDNA.targetAudience);
    fd.set("noGos", generatedDNA.noGos);
    submit(fd, { method: "post" });
  };

  const handleApplyCustomTemplate = (tmpl) => {
    const fd = new FormData();
    fd.set("intent", "applyCustomTemplate");
    fd.set("brandVoice", tmpl.brandVoice);
    fd.set("targetAudience", tmpl.targetAudience);
    fd.set("templateNoGos", tmpl.noGos);
    submit(fd, { method: "post" });
  };

  const handleDeleteCustomTemplate = (templateId) => {
    const fd = new FormData();
    fd.set("intent", "deleteCustomTemplate");
    fd.set("templateId", templateId);
    submit(fd, { method: "post" });
  };

  const handleStartEdit = (tmpl) => {
    setEditingTemplate(tmpl.id);
    setEditForm({
      name: tmpl.name || "",
      brandVoice: tmpl.brandVoice || "",
      targetAudience: tmpl.targetAudience || "",
      noGos: tmpl.noGos || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingTemplate || !editForm.name.trim()) return;
    const fd = new FormData();
    fd.set("intent", "editCustomTemplate");
    fd.set("templateId", editingTemplate);
    fd.set("name", editForm.name.trim());
    fd.set("brandVoice", editForm.brandVoice);
    fd.set("targetAudience", editForm.targetAudience);
    fd.set("noGos", editForm.noGos);
    submit(fd, { method: "post" });
  };

  const handleCancelEdit = () => {
    setEditingTemplate(null);
    setEditForm({ name: "", brandVoice: "", targetAudience: "", noGos: "" });
  };

  /* ═══════════════════════════════════════════
     TAB 1 — Vorlagen
     ═══════════════════════════════════════════ */
  const renderVorlagen = () => {
    // KI-Empfehlung Banner
    const recommendedId = TEMPLATES[0].id; // Fallback

    return (
      <BlockStack gap="500">
        {/* Vorschlag für deinen Shop */}
        <div style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
          borderRadius: "20px",
          padding: "28px 32px",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: "-40px", right: "-20px",
            width: "200px", height: "200px",
            background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)",
            borderRadius: "50%",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={{ fontSize: "24px" }}>🤖</span>
              <span style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.3px" }}>
                Vorschlag für deinen Shop
              </span>
            </div>
            <p style={{ fontSize: "14px", opacity: 0.85, margin: "0 0 16px 0", lineHeight: 1.6 }}>
              Basierend auf deiner Shop-Analyse empfehlen wir dir ein Template, das perfekt zu deiner Branche und Zielgruppe passt.
              Starte mit einer Vorlage und passe sie im Tab „Eigene erstellen" individuell an.
            </p>
            <button
              onClick={() => setSelectedTab(1)}
              style={{
                padding: "10px 24px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                transition: "all 0.2s ease",
              }}
            >
              Eigenes Template erstellen →
            </button>
          </div>
        </div>

        {/* Plan-Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: "#6b7280" }}>Aktueller Plan:</span>
          <span style={S.tierBadge(currentPlan === "Enterprise" ? "enterprise" : currentPlan === "Pro" ? "pro" : "starter")}>
            {currentPlan}
          </span>
          {currentPlan === "Starter" && (
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              — {FREE_LIMIT} von {TEMPLATES.length} Templates verfügbar
            </span>
          )}
          <span style={{ fontSize: "13px", color: "#9ca3af" }}>
            ({TEMPLATES.length} Templates insgesamt)
          </span>
        </div>

        {/* Template Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "16px",
        }}>
          {TEMPLATES.map((template, index) => {
            const accessible = canAccess(template, index);
            const isActive = activeId === template.id;
            const isHovered = hoveredCard === template.id;
            const isExpanded = expandedCard === template.id;

            return (
              <div
                key={template.id}
                style={{
                  ...S.templateCard(isActive, !accessible),
                  ...(isHovered && accessible ? S.templateCardHover : {}),
                }}
                onMouseEnter={() => accessible && setHoveredCard(template.id)}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => accessible && setExpandedCard(isExpanded ? null : template.id)}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "44px", height: "44px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(6,182,212,0.1))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "22px",
                    }}>
                      {template.icon}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "15px", fontWeight: 700, color: "#1f2937" }}>
                          {template.name}
                        </span>
                        {isActive && (
                          <span style={S.activeBadge}>✓ Aktiv</span>
                        )}
                        {template.tier !== "starter" && (
                          <span style={S.tierBadge(template.tier)}>
                            {!accessible && "🔒 "}{template.tier === "enterprise" ? "Enterprise" : "Pro"}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>{template.industry}</span>
                    </div>
                  </div>
                  {accessible && (
                    <span style={{ fontSize: "11px", color: "#6366f1", fontWeight: 500, marginTop: "4px" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  )}
                </div>

                {/* Beschreibung */}
                <p style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.6, margin: "0 0 12px 0" }}>
                  {template.description}
                </p>

                {/* Tags */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: accessible && isExpanded ? "16px" : "0" }}>
                  {template.tags.map(tag => (
                    <span key={tag} style={S.tagChip}>{tag}</span>
                  ))}
                </div>

                {/* Locked Banner */}
                {!accessible && (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
                    border: "1px solid #fde68a",
                    fontSize: "13px",
                    color: "#92400e",
                  }}>
                    Upgrade auf {template.tier === "enterprise" ? "Enterprise" : "Pro"} für dieses Template.{" "}
                    <a href="/app/billing" style={{ color: "#6d28d9", fontWeight: 600, textDecoration: "none" }}>
                      Jetzt upgraden →
                    </a>
                  </div>
                )}

                {/* Expanded Details */}
                {accessible && isExpanded && (
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
                    {/* Beispiel-Output (immer sichtbar) */}
                    <div style={{ marginBottom: "16px" }}>
                      <div style={S.sectionTitle}>Beispiel-Output</div>
                      <div style={{
                        padding: "12px 16px",
                        borderRadius: "10px",
                        background: "linear-gradient(135deg, #f0f0ff, #e8f4f8)",
                        border: "1px solid rgba(99,102,241,0.1)",
                        fontSize: "13px",
                        fontStyle: "italic",
                        color: "#374151",
                        lineHeight: 1.6,
                      }}>
                        „{template.exampleOutput}"
                      </div>
                    </div>

                    <div style={{
                      marginBottom: "16px",
                      padding: "12px 16px",
                      borderRadius: "10px",
                      background: "rgba(99, 102, 241, 0.04)",
                      border: "1px dashed rgba(99, 102, 241, 0.2)",
                      fontSize: "12px",
                      color: "#6b7280",
                    }}>
                      Die vollständige Brand DNA (Markenstimme, Zielgruppe, No-Gos) wird beim Aktivieren automatisch übernommen.
                      Details sind aus Qualitätsgründen geschützt.
                    </div>

                    {/* Apply Button */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyTemplate(template.id);
                        }}
                        style={{
                          padding: "10px 24px",
                          borderRadius: "10px",
                          border: "none",
                          background: isActive
                            ? "linear-gradient(135deg, #10b981, #059669)"
                            : "linear-gradient(135deg, #6366f1, #06b6d4)",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        {isActive ? "✓ Aktiv — erneut anwenden" : "Template aktivieren"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </BlockStack>
    );
  };

  /* ═══════════════════════════════════════════
     TAB 2 — Eigene erstellen (Quiz)
     ═══════════════════════════════════════════ */
  const TOTAL_QUIZ_STEPS = 8; // 0-6 = Fragen, 7 = Vorschau
  const quizProgress = Math.round((quizStep / (TOTAL_QUIZ_STEPS - 1)) * 100);

  const canProceed = useMemo(() => {
    switch (quizStep) {
      case 0: return !!quizData.industry;
      case 1: return !!quizData.style;
      case 2: return quizData.customers.length > 0;
      case 3: return true; // Ansprache hat Default
      case 4: return quizData.values.length > 0;
      case 5: return true; // No-Gos optional
      case 6: return true; // businessDesc optional
      default: return false;
    }
  }, [quizStep, quizData]);

  const handleQuizNext = () => {
    if (quizStep === 6) {
      handleGenerateCustom();
    } else if (quizStep < 7) {
      setQuizStep(s => s + 1);
    }
  };

  const handleQuizBack = () => {
    if (quizStep > 0) setQuizStep(s => s - 1);
  };

  const renderQuizStep = () => {
    switch (quizStep) {
      // Frage 1: Was verkaufst du?
      case 0:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🏪</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Was verkaufst du?
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Wähle die Branche, die am besten zu deinem Shop passt.
              </p>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "12px",
            }}>
              {QUIZ_INDUSTRIES.map(ind => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => setQuizData(p => ({ ...p, industry: ind.label }))}
                  style={S.quizOptionCard(quizData.industry === ind.label)}
                  onMouseEnter={(e) => {
                    if (quizData.industry !== ind.label) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.15)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (quizData.industry !== ind.label) {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                    }
                  }}
                >
                  <span style={{ fontSize: "28px", marginBottom: "6px" }}>{ind.icon}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: quizData.industry === ind.label ? "#6d28d9" : "#374151" }}>
                    {ind.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );

      // Frage 2: Stil
      case 1:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🎨</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Wie würdest du deinen Stil beschreiben?
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Wähle den Stil, der deine Marke am besten repräsentiert.
              </p>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "16px",
              maxWidth: "600px",
              margin: "0 auto",
            }}>
              {QUIZ_STYLES.map(style => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setQuizData(p => ({ ...p, style: style.label }))}
                  style={{
                    ...S.quizOptionCard(quizData.style === style.label),
                    padding: "24px 16px",
                  }}
                  onMouseEnter={(e) => {
                    if (quizData.style !== style.label) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.15)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (quizData.style !== style.label) {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                    }
                  }}
                >
                  <span style={{ fontSize: "36px", marginBottom: "10px" }}>{style.icon}</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: quizData.style === style.label ? "#6d28d9" : "#1f2937", marginBottom: "4px" }}>
                    {style.label}
                  </span>
                  <span style={{ fontSize: "11px", color: "#6b7280" }}>{style.desc}</span>
                </button>
              ))}
            </div>
          </div>
        );

      // Frage 3: Kunden
      case 2:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>👥</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Wer sind deine Kunden?
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Wähle die Kundengruppen und den Altersbereich.
              </p>
            </div>

            {/* Altersrange */}
            <div style={{ marginBottom: "28px", maxWidth: "500px", margin: "0 auto 28px auto" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "12px", textAlign: "center" }}>
                Altersbereich: {quizData.ageMin} – {quizData.ageMax} Jahre
              </div>
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#6b7280", minWidth: "30px" }}>Von</span>
                <input
                  type="range" min="14" max="70"
                  value={quizData.ageMin}
                  onChange={(e) => setQuizData(p => ({ ...p, ageMin: Math.min(Number(e.target.value), p.ageMax - 5) }))}
                  style={{ flex: 1, accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: "12px", color: "#6b7280", minWidth: "30px" }}>Bis</span>
                <input
                  type="range" min="18" max="80"
                  value={quizData.ageMax}
                  onChange={(e) => setQuizData(p => ({ ...p, ageMax: Math.max(Number(e.target.value), p.ageMin + 5) }))}
                  style={{ flex: 1, accentColor: "#06b6d4" }}
                />
              </div>
            </div>

            {/* Lifestyle Cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "12px",
              maxWidth: "560px",
              margin: "0 auto",
            }}>
              {QUIZ_CUSTOMERS.map(cust => {
                const selected = quizData.customers.includes(cust.label);
                return (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => setQuizData(p => ({
                      ...p,
                      customers: selected
                        ? p.customers.filter(c => c !== cust.label)
                        : [...p.customers, cust.label],
                    }))}
                    style={S.quizOptionCard(selected)}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.15)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                      }
                    }}
                  >
                    <span style={{ fontSize: "28px", marginBottom: "6px" }}>{cust.icon}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: selected ? "#6d28d9" : "#374151" }}>
                      {cust.label}
                    </span>
                    {selected && <span style={{ fontSize: "10px", color: "#6366f1" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // Frage 4: Ansprache
      case 3:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>💬</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Wie sprichst du deine Kunden an?
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Wähle zwischen Du und Sie, und bestimme den Tonfall.
              </p>
            </div>

            {/* Du/Sie Toggle */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: "16px",
              marginBottom: "36px",
            }}>
              {["du", "sie"].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setQuizData(p => ({ ...p, ansprache: opt }))}
                  style={{
                    padding: "20px 48px",
                    borderRadius: "14px",
                    border: quizData.ansprache === opt ? "2px solid #6366f1" : "1px solid #d1d5db",
                    background: quizData.ansprache === opt
                      ? "linear-gradient(135deg, #ede9fe, #ddd6fe)"
                      : "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ fontSize: "32px", display: "block", marginBottom: "8px" }}>
                    {opt === "du" ? "👋" : "🤝"}
                  </span>
                  <span style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: quizData.ansprache === opt ? "#6d28d9" : "#374151",
                  }}>
                    {opt === "du" ? "Du" : "Sie"}
                  </span>
                  <span style={{ display: "block", fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                    {opt === "du" ? "Nahbar & persönlich" : "Respektvoll & professionell"}
                  </span>
                </button>
              ))}
            </div>

            {/* Tonfall Slider */}
            <div style={{ maxWidth: "500px", margin: "0 auto" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "16px", textAlign: "center" }}>
                Tonfall: {Number(quizData.formalitaet) < 30 ? "Sehr formell" : Number(quizData.formalitaet) < 50 ? "Eher formell" : Number(quizData.formalitaet) < 70 ? "Ausgewogen" : Number(quizData.formalitaet) < 85 ? "Eher locker" : "Sehr locker"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>Formal</span>
                <input
                  type="range" min="0" max="100"
                  value={quizData.formalitaet}
                  onChange={(e) => setQuizData(p => ({ ...p, formalitaet: Number(e.target.value) }))}
                  style={{ flex: 1, accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>Locker</span>
              </div>
            </div>
          </div>
        );

      // Frage 5: Was ist dir wichtig?
      case 4:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🎯</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Was ist dir besonders wichtig?
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Wähle die Werte, die deine Marke definieren. Mehrfachauswahl möglich.
              </p>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "14px",
              maxWidth: "560px",
              margin: "0 auto",
            }}>
              {QUIZ_VALUES.map(val => {
                const selected = quizData.values.includes(val.label);
                return (
                  <button
                    key={val.id}
                    type="button"
                    onClick={() => setQuizData(p => ({
                      ...p,
                      values: selected
                        ? p.values.filter(v => v !== val.label)
                        : [...p.values, val.label],
                    }))}
                    style={{
                      ...S.quizOptionCard(selected),
                      padding: "20px 14px",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.15)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                      }
                    }}
                  >
                    <span style={{ fontSize: "32px", marginBottom: "8px" }}>{val.icon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: selected ? "#6d28d9" : "#1f2937" }}>
                      {val.label}
                    </span>
                    {selected && <span style={{ fontSize: "18px", marginTop: "4px" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // Frage 6: No-Gos
      case 5:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🚫</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Was soll die KI NIEMALS tun?
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Wähle No-Gos aus oder füge eigene hinzu.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
              {QUIZ_NOGOS_PRESETS.map(nogo => {
                const selected = quizData.noGos.includes(nogo);
                return (
                  <button
                    key={nogo}
                    type="button"
                    onClick={() => setQuizData(p => ({
                      ...p,
                      noGos: selected
                        ? p.noGos.filter(n => n !== nogo)
                        : [...p.noGos, nogo],
                    }))}
                    style={S.chipButton(selected, "red")}
                  >
                    {selected ? "✕ " : ""}{nogo}
                  </button>
                );
              })}
            </div>
            <div style={{ maxWidth: "500px", margin: "0 auto" }}>
              <TextField
                label="Eigene No-Gos (optional)"
                value={quizData.customNoGos}
                onChange={(val) => setQuizData(p => ({ ...p, customNoGos: val }))}
                placeholder="z.B. Keine Wortspiele, kein Slang..."
                multiline={2}
              />
            </div>
          </div>
        );

      // Frage 7: Beschreibe dein Geschäft
      case 6:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>✍️</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Letzte Frage: Beschreibe dein Geschäft in einem Satz
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Dieser Satz hilft der KI, deine Brand DNA noch präziser zu generieren.
              </p>
            </div>
            <div style={{ maxWidth: "600px", margin: "0 auto" }}>
              <TextField
                value={quizData.businessDesc}
                onChange={(val) => setQuizData(p => ({ ...p, businessDesc: val }))}
                placeholder="z.B. Wir verkaufen handgemachte Keramik aus unserem Atelier in München..."
                multiline={3}
                autoComplete="off"
              />
              <div style={{
                marginTop: "16px",
                padding: "16px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #f0f0ff, #e8f4f8)",
                border: "1px solid rgba(99,102,241,0.1)",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#6366f1", marginBottom: "8px" }}>
                  📋 Zusammenfassung deiner Angaben:
                </div>
                <div style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.8 }}>
                  <div><strong>Branche:</strong> {quizData.industry || "–"}</div>
                  <div><strong>Stil:</strong> {quizData.style || "–"}</div>
                  <div><strong>Kunden:</strong> {quizData.customers.join(", ") || "–"} ({quizData.ageMin}–{quizData.ageMax} Jahre)</div>
                  <div><strong>Ansprache:</strong> {quizData.ansprache === "du" ? "Du" : "Sie"} | Tonfall: {quizData.formalitaet}/100</div>
                  <div><strong>Werte:</strong> {quizData.values.join(", ") || "–"}</div>
                  <div><strong>No-Gos:</strong> {[...quizData.noGos, quizData.customNoGos].filter(Boolean).join(", ") || "–"}</div>
                </div>
              </div>
            </div>
          </div>
        );

      // Schritt 8: Vorschau der generierten DNA
      case 7:
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🧬</span>
              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937", margin: "0 0 8px 0" }}>
                Deine Brand DNA ist fertig!
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                Prüfe das Ergebnis und speichere es als Template.
              </p>
            </div>

            {generatedDNA ? (
              <div>
                <div style={{
                  borderRadius: "16px",
                  border: "2px solid #10b981",
                  overflow: "hidden",
                  marginBottom: "24px",
                }}>
                  <div style={{
                    padding: "16px 20px",
                    background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
                    borderBottom: "1px solid #a7f3d0",
                  }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#065f46" }}>
                      ✓ KI-generierte Brand DNA
                    </span>
                  </div>
                  <div style={{ padding: "20px" }}>
                    <div style={{ marginBottom: "16px" }}>
                      <div style={S.sectionTitle}>Markenstimme</div>
                      <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.7, margin: 0 }}>
                        {generatedDNA.brandVoice}
                      </p>
                    </div>
                    <div style={{ height: "1px", background: "#e5e7eb", margin: "16px 0" }} />
                    <div style={{ marginBottom: "16px" }}>
                      <div style={S.sectionTitle}>Zielgruppe</div>
                      <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.7, margin: 0 }}>
                        {generatedDNA.targetAudience}
                      </p>
                    </div>
                    <div style={{ height: "1px", background: "#e5e7eb", margin: "16px 0" }} />
                    <div>
                      <div style={S.sectionTitle}>No-Gos</div>
                      <p style={{ fontSize: "13px", color: "#dc2626", lineHeight: 1.7, margin: 0 }}>
                        {generatedDNA.noGos}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Save as Template */}
                <div style={{
                  padding: "20px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #f0f0ff, #e8f4f8)",
                  border: "1px solid rgba(99,102,241,0.15)",
                }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937", marginBottom: "12px" }}>
                    💾 Als Template speichern
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Template-Name"
                        value={templateName}
                        onChange={setTemplateName}
                        placeholder="z.B. Mein Keramik-Shop Style"
                      />
                    </div>
                    <button
                      onClick={handleSaveCustomTemplate}
                      disabled={!templateName.trim()}
                      style={{
                        ...S.navButton("primary"),
                        opacity: templateName.trim() ? 1 : 0.5,
                        cursor: templateName.trim() ? "pointer" : "default",
                        marginBottom: "2px",
                      }}
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: "center",
                padding: "40px",
                borderRadius: "14px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
              }}>
                {isGenerating ? (
                  <>
                    <span style={{ fontSize: "32px", display: "block", marginBottom: "12px" }}>⏳</span>
                    <p style={{ fontSize: "14px", color: "#92400e" }}>
                      KI generiert deine Brand DNA... Bitte warten.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: "14px", color: "#92400e" }}>
                      Noch keine Brand DNA generiert. Gehe zurück und vervollständige den Fragebogen.
                    </p>
                    <button onClick={() => setQuizStep(6)} style={S.navButton()}>
                      Zurück zu Schritt 7
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const renderEigeneErstellen = () => (
    <BlockStack gap="400">
      {/* Progress Bar */}
      <div style={S.progressBar}>
        <div style={S.progressFill(quizProgress)} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "#6b7280" }}>
          Schritt {Math.min(quizStep + 1, 7)} von 7
        </span>
        <span style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600 }}>
          {quizProgress}%
        </span>
      </div>

      {/* Quiz Card */}
      <div style={S.quizCard}>
        {renderQuizStep()}
      </div>

      {/* Navigation */}
      {quizStep < 7 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={handleQuizBack}
            disabled={quizStep === 0}
            style={{
              ...S.navButton(),
              opacity: quizStep === 0 ? 0.4 : 1,
              cursor: quizStep === 0 ? "default" : "pointer",
            }}
          >
            ← Zurück
          </button>
          <button
            onClick={handleQuizNext}
            disabled={!canProceed || isGenerating}
            style={{
              ...S.navButton("primary"),
              opacity: canProceed && !isGenerating ? 1 : 0.5,
              cursor: canProceed && !isGenerating ? "pointer" : "default",
            }}
          >
            {isGenerating ? "⏳ Generiere..." : quizStep === 6 ? "🧬 Brand DNA generieren" : "Weiter →"}
          </button>
        </div>
      )}

      {quizStep === 7 && generatedDNA && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => { setQuizStep(0); setGeneratedDNA(null); setTemplateName(""); }}
            style={S.navButton()}
          >
            🔄 Neu starten
          </button>
          <button
            onClick={() => setQuizStep(5)}
            style={S.navButton()}
          >
            ← Zurück & anpassen
          </button>
        </div>
      )}
    </BlockStack>
  );

  /* ═══════════════════════════════════════════
     TAB 3 — Meine Templates
     ═══════════════════════════════════════════ */
  const renderMeineTemplates = () => {
    const sorted = [...customTemplates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return (
      <BlockStack gap="500">
        {/* Aktuelles aktives Template */}
        {currentVoice && (
          <div style={{
            background: "linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)",
            border: "2px solid #10b981",
            borderRadius: "16px",
            padding: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={S.activeBadge}>✓ Aktuell aktiv</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#065f46" }}>
                {activeId ? (TEMPLATES.find(t => t.id === activeId)?.name || "Custom Template") : "Individuelles Profil"}
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "#065f46", margin: 0 }}>
              Deine aktive Brand DNA wird bei jeder SEO-Optimierung automatisch verwendet.
            </p>
          </div>
        )}

        {!currentVoice && (
          <Banner tone="warning">
            <p>Du hast noch keine Brand DNA aktiv. Wähle ein Template aus der Bibliothek oder erstelle ein eigenes.</p>
          </Banner>
        )}

        {/* Custom Templates */}
        <div>
          <div style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#1f2937",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <span>📂</span> Gespeicherte Templates ({sorted.length})
          </div>

          {sorted.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "48px",
              borderRadius: "16px",
              background: "#f9fafb",
              border: "1px dashed #d1d5db",
            }}>
              <span style={{ fontSize: "48px", display: "block", marginBottom: "16px" }}>📝</span>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#374151", margin: "0 0 8px 0" }}>
                Noch keine eigenen Templates
              </p>
              <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 20px 0" }}>
                Erstelle dein erstes Template über den interaktiven Quiz.
              </p>
              <button
                onClick={() => setSelectedTab(1)}
                style={S.navButton("primary")}
              >
                Jetzt erstellen →
              </button>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "16px",
            }}>
              {sorted.map(tmpl => {
                const isActive = currentVoice === tmpl.brandVoice;
                const isEditing = editingTemplate === tmpl.id;
                return (
                  <div key={tmpl.id} style={S.customTemplateCard(isActive)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "20px" }}>📄</span>
                        <div>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937" }}>
                            {tmpl.name}
                          </span>
                          {isActive && (
                            <span style={{ ...S.activeBadge, marginLeft: "8px", fontSize: "10px" }}>Aktiv</span>
                          )}
                          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                            Erstellt: {new Date(tmpl.createdAt).toLocaleDateString("de-DE")}
                            {tmpl.updatedAt && ` · Bearbeitet: ${new Date(tmpl.updatedAt).toLocaleDateString("de-DE")}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Edit Form */}
                    {isEditing ? (
                      <div style={{ marginBottom: "16px" }}>
                        <BlockStack gap="300">
                          <TextField
                            label="Template-Name"
                            value={editForm.name}
                            onChange={(v) => setEditForm(p => ({ ...p, name: v }))}
                            autoComplete="off"
                          />
                          <TextField
                            label="Markenstimme (Brand Voice)"
                            value={editForm.brandVoice}
                            onChange={(v) => setEditForm(p => ({ ...p, brandVoice: v }))}
                            multiline={4}
                            autoComplete="off"
                          />
                          <TextField
                            label="Zielgruppe"
                            value={editForm.targetAudience}
                            onChange={(v) => setEditForm(p => ({ ...p, targetAudience: v }))}
                            multiline={3}
                            autoComplete="off"
                          />
                          <TextField
                            label="No-Gos"
                            value={editForm.noGos}
                            onChange={(v) => setEditForm(p => ({ ...p, noGos: v }))}
                            multiline={3}
                            autoComplete="off"
                          />
                          <InlineStack gap="200" align="end">
                            <button
                              onClick={handleCancelEdit}
                              style={{
                                padding: "6px 14px", borderRadius: "8px",
                                border: "1px solid #d1d5db", background: "#fff",
                                color: "#374151", fontSize: "12px", fontWeight: 500,
                                cursor: "pointer", transition: "all 0.2s ease",
                              }}
                            >
                              Abbrechen
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              style={{
                                padding: "6px 14px", borderRadius: "8px",
                                border: "none",
                                background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                                color: "#fff", fontSize: "12px", fontWeight: 600,
                                cursor: "pointer", transition: "all 0.2s ease",
                              }}
                            >
                              Speichern
                            </button>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    ) : (
                      <>
                        {/* Preview */}
                        <div style={{
                          padding: "12px",
                          borderRadius: "10px",
                          background: "rgba(99,102,241,0.04)",
                          marginBottom: "16px",
                          fontSize: "12px",
                          color: "#4b5563",
                          lineHeight: 1.6,
                        }}>
                          <div style={{ marginBottom: "6px" }}>
                            <strong style={{ color: "#6366f1", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Markenstimme:</strong>
                            <div style={{ marginTop: "2px" }}>{tmpl.brandVoice ? tmpl.brandVoice.substring(0, 120) + (tmpl.brandVoice.length > 120 ? "..." : "") : "–"}</div>
                          </div>
                          <div>
                            <strong style={{ color: "#6366f1", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>No-Gos:</strong>
                            <div style={{ marginTop: "2px" }}>{tmpl.noGos ? tmpl.noGos.substring(0, 100) + (tmpl.noGos.length > 100 ? "..." : "") : "–"}</div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Actions */}
                    {!isEditing && (
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => handleDeleteCustomTemplate(tmpl.id)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "8px",
                          border: "1px solid #fecaca",
                          background: "#fff",
                          color: "#dc2626",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        🗑 Löschen
                      </button>
                      <button
                        onClick={() => handleStartEdit(tmpl)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "8px",
                          border: "1px solid #c7d2fe",
                          background: "#fff",
                          color: "#6366f1",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleApplyCustomTemplate(tmpl)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "8px",
                          border: "none",
                          background: isActive
                            ? "linear-gradient(135deg, #10b981, #059669)"
                            : "linear-gradient(135deg, #6366f1, #06b6d4)",
                          color: "#fff",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        {isActive ? "✓ Aktiv" : "Aktivieren"}
                      </button>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Zuletzt verwendet */}
        {currentVoice && sorted.length > 0 && (
          <div>
            <div style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              <span>🕐</span> Zuletzt verwendet
            </div>
            <div style={{
              padding: "12px 16px",
              borderRadius: "10px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              fontSize: "13px",
              color: "#4b5563",
            }}>
              {activeId ? (TEMPLATES.find(t => t.id === activeId)?.name || "Custom Template") : "Individuelles Profil"} — aktiv seit letzter Änderung
            </div>
          </div>
        )}
      </BlockStack>
    );
  };

  /* ═══════════════════════════════════════════
     HAUPTRENDER
     ═══════════════════════════════════════════ */
  const tabLabels = [
    { label: "Vorlagen", icon: "📋" },
    { label: "Eigene erstellen", icon: "🧬" },
    { label: "Meine Templates", icon: "📁" },
  ];

  return (
    <Page
      title="Brand DNA Templates"
      subtitle="Vorgefertigte Profile, individueller Builder und gespeicherte Templates"
      backAction={{ content: "Zurück", url: "/app" }}
    >
      <div className="titan-fade-in">
        <BlockStack gap="500">

          {/* Limit erreicht */}
          {actionData?.limitReached && (
            <Banner tone="warning" title="Tageslimit erreicht">
              <p>{actionData.error}</p>
              <div style={{ marginTop: "12px" }}>
                <Button variant="primary" url={actionData.upgradeUrl || "/app/billing"}>Jetzt upgraden</Button>
              </div>
            </Banner>
          )}

          {/* Aktive Brand DNA — prominente Anzeige */}
          {currentVoice ? (
            <div style={{
              background: "linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)",
              borderRadius: "16px",
              padding: "20px 24px",
              color: "#fff",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(5, 150, 105, 0.3)",
            }}>
              <div style={{
                position: "absolute", top: "-30px", right: "-10px",
                width: "140px", height: "140px",
                background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
                borderRadius: "50%",
              }} />
              <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "14px",
                    background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "24px",
                  }}>
                    {activeId ? (TEMPLATES.find(t => t.id === activeId)?.icon || "📄") : "📄"}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        padding: "2px 10px", borderRadius: "20px",
                        background: "rgba(255,255,255,0.2)", fontSize: "11px", fontWeight: 700,
                        letterSpacing: "0.5px", textTransform: "uppercase",
                      }}>
                        Aktive Brand DNA
                      </span>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.2px" }}>
                      {activeId ? (TEMPLATES.find(t => t.id === activeId)?.name || "Custom Template") : "Individuelles Profil"}
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px" }}>
                      Wird bei jeder SEO-Optimierung automatisch angewendet
                    </div>
                  </div>
                </div>
                {currentNoGos && (
                  <div style={{
                    padding: "8px 14px", borderRadius: "10px",
                    background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)",
                    fontSize: "11px", maxWidth: "300px", lineHeight: 1.5, opacity: 0.9,
                  }}>
                    <strong>No-Gos:</strong> {currentNoGos.substring(0, 100)}{currentNoGos.length > 100 ? "..." : ""}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Banner tone="warning">
              <p>Noch keine Brand DNA aktiv. Wähle ein Template oder erstelle ein eigenes, um deine SEO-Texte zu personalisieren.</p>
            </Banner>
          )}

          {/* Premium Tab Pills */}
          <div style={S.tabBar}>
            {tabLabels.map((tab, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedTab(i)}
                style={S.tabPill(selectedTab === i)}
                onMouseEnter={(e) => {
                  if (selectedTab !== i) {
                    e.currentTarget.style.background = "rgba(99,102,241,0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedTab !== i) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span style={{ marginRight: "6px" }}>{tab.icon}</span>
                {tab.label}
                {i === 2 && customTemplates.length > 0 && (
                  <span style={{
                    marginLeft: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: selectedTab === i ? "rgba(255,255,255,0.25)" : "rgba(99,102,241,0.12)",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}>
                    {customTemplates.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ minHeight: "500px" }}>
            {selectedTab === 0 && renderVorlagen()}
            {selectedTab === 1 && renderEigeneErstellen()}
            {selectedTab === 2 && renderMeineTemplates()}
          </div>

        </BlockStack>
      </div>
    </Page>
  );
}
