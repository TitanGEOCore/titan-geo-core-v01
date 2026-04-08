import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import {
  Page,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Card,
  TextField,
  Banner,
  Divider,
  Badge,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  // If onboarding is already complete, redirect to dashboard
  if (settings?.brandVoice) {
    return redirect("/app");
  }

  return json({ shop: session.shop });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  // Server-side validation
  const brandVoice = (formData.get("brandVoice") || "").trim();
  const targetAudience = (formData.get("targetAudience") || "").trim();
  const noGos = (formData.get("noGos") || "").trim();

  const errors = {};

  // Validate brandVoice
  if (!brandVoice) {
    errors.brandVoice = "Bitte beschreibe deine Brand Voice.";
  } else if (brandVoice.length < 10) {
    errors.brandVoice = "Bitte gib mindestens 10 Zeichen ein für eine aussagekräftige Beschreibung.";
  }

  // Validate targetAudience
  if (!targetAudience) {
    errors.targetAudience = "Bitte beschreibe deine Zielgruppe.";
  } else if (targetAudience.length < 10) {
    errors.targetAudience = "Bitte gib mindestens 10 Zeichen ein für eine aussagekräftige Beschreibung.";
  }

  // If there are validation errors, return them
  if (Object.keys(errors).length > 0) {
    return json({ errors, success: false }, { status: 400 });
  }

  // Save to database
  await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {
      brandVoice,
      targetAudience,
      noGos,
    },
    create: {
      shop: session.shop,
      brandVoice,
      targetAudience,
      noGos,
    },
  });

  return redirect("/app");
};

const BRAND_VOICE_SUGGESTIONS = [
  "Premium & professionell",
  "Locker & humorvoll",
  "Sachlich & informativ",
  "Jung & modern",
  "Luxurioes & exklusiv",
  "Nachhaltig & bewusst",
];

const AUDIENCE_PROMPTS = [
  "Alter und Geschlecht der Zielgruppe",
  "Interessen und Hobbys",
  "Einkommensniveau und Kaufverhalten",
  "Werte und Ueberzeugungen",
];

const TEMPLATES = [
  {
    name: "E-Commerce Standard",
    brandVoice:
      "Professionell, freundlich, duzt den Kunden. Klare Produktvorteile hervorheben.",
    targetAudience:
      "Online-Kaeufer, 25-55 Jahre, qualitaetsbewusst, vergleichen Preise und Bewertungen.",
    noGos:
      "Keine uebertriebenen Superlative, keine falschen Versprechen, keine Emojis.",
  },
  {
    name: "Premium / Luxus",
    brandVoice:
      "Exklusiv, elegant, siezt den Kunden. Fokus auf Handwerk, Materialien und Storytelling.",
    targetAudience:
      "Anspruchsvolle Kaeufer, 30-65 Jahre, hohes Einkommen, Wert auf Qualitaet und Exklusivitaet.",
    noGos:
      "Keine Rabatt-Sprache, keine Dringlichkeit ('nur noch X Stueck'), kein umgangssprachlicher Ton.",
  },
  {
    name: "Jung & Trendy",
    brandVoice:
      "Cool, authentisch, duzt, nutzt zeitgemaesse Sprache. Kurze, praegnante Saetze.",
    targetAudience:
      "Gen Z und junge Millennials, 18-30 Jahre, social-media-affin, trendorientiert.",
    noGos: "Kein 'Sie', keine langen Absaetze, keine veralteten Begriffe.",
  },
];

const MAX_CHARS = 500;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [brandVoice, setBrandVoice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [noGos, setNoGos] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [errors, setErrors] = useState({});
  const [animDirection, setAnimDirection] = useState("forward");
  const submit = useSubmit();
  const navigate = useNavigate();

  const totalSteps = 4;

  const validateStep = useCallback(
    (stepIndex) => {
      const newErrors = {};

      if (stepIndex === 0) {
        if (!brandVoice.trim()) {
          newErrors.brandVoice =
            "Bitte beschreibe deine Brand Voice (mindestens ein paar Worte).";
        } else if (brandVoice.trim().length < 10) {
          newErrors.brandVoice =
            "Bitte gib mindestens 10 Zeichen ein fuer eine aussagekraeftige Beschreibung.";
        }
      }

      if (stepIndex === 1) {
        if (!targetAudience.trim()) {
          newErrors.targetAudience =
            "Bitte beschreibe deine Zielgruppe (mindestens ein paar Worte).";
        } else if (targetAudience.trim().length < 10) {
          newErrors.targetAudience =
            "Bitte gib mindestens 10 Zeichen ein fuer eine aussagekraeftige Beschreibung.";
        }
      }

      // Step 2 (NoGos) is optional
      // Step 3 (Summary) has no validation

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [brandVoice, targetAudience]
  );

  const goNext = () => {
    if (step < 2 && !validateStep(step)) {
      return;
    }
    setAnimDirection("forward");
    setErrors({});
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const goBack = () => {
    setAnimDirection("back");
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  const applyTemplate = (template) => {
    setSelectedTemplate(template.name);
    setBrandVoice(template.brandVoice);
    setTargetAudience(template.targetAudience);
    setNoGos(template.noGos);
  };

  const handleFinish = () => {
    const formData = new FormData();
    formData.set("brandVoice", brandVoice);
    formData.set("targetAudience", targetAudience);
    formData.set("noGos", noGos);
    submit(formData, { method: "post" });
  };

  const addSuggestion = (suggestion) => {
    if (brandVoice) {
      setBrandVoice((prev) => prev + ", " + suggestion.toLowerCase());
    } else {
      setBrandVoice(suggestion);
    }
  };

  // Step progress percentage
  const progressPercent = ((step + 1) / totalSteps) * 100;

  return (
    <Page>
      <div
        style={{
          maxWidth: "740px",
          margin: "0 auto",
          padding: "20px 16px 40px",
        }}
      >
        {/* Background decoration */}
        <div
          className="titan-wizard titan-fade-in"
          style={{
            padding: "0",
            overflow: "hidden",
          }}
        >
          {/* Progress Bar */}
          <div
            style={{
              height: "4px",
              background: "rgba(99, 102, 241, 0.1)",
              borderRadius: "4px 4px 0 0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background:
                  "linear-gradient(90deg, var(--titan-primary, #6366f1), var(--titan-accent, #06b6d4))",
                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                borderRadius: "4px",
              }}
            />
          </div>

          <div style={{ padding: "32px 28px" }}>
            {/* Step Indicators */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "12px",
                marginBottom: "32px",
              }}
            >
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: i === step ? "36px" : "10px",
                      height: "10px",
                      borderRadius: "5px",
                      background:
                        i === step
                          ? "linear-gradient(90deg, var(--titan-primary, #6366f1), var(--titan-accent, #06b6d4))"
                          : i < step
                            ? "var(--titan-primary, #6366f1)"
                            : "rgba(99, 102, 241, 0.15)",
                      transition:
                        "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      cursor: i < step ? "pointer" : "default",
                    }}
                    onClick={() => {
                      if (i < step) {
                        setAnimDirection("back");
                        setStep(i);
                      }
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Step counter */}
            <div style={{ textAlign: "center", marginBottom: "8px" }}>
              <Text variant="bodySm" as="p" tone="subdued">
                Schritt {step + 1} von {totalSteps}
              </Text>
            </div>

            {/* ====== STEP 0: Brand Voice ====== */}
            {step === 0 && (
              <div
                key="step-0"
                style={{
                  animation: `titan-slide-${animDirection === "forward" ? "in-right" : "in-left"} 0.4s ease-out`,
                }}
              >
                <BlockStack gap="500">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h1" alignment="center">
                      Deine Brand Voice
                    </Text>
                    <Text
                      variant="bodyMd"
                      as="p"
                      alignment="center"
                      tone="subdued"
                    >
                      Wie spricht deine Marke? Der Tonfall beeinflusst alle
                      KI-generierten Texte.
                    </Text>
                  </BlockStack>

                  <Box paddingBlockStart="200">
                    <TextField
                      label="Brand Voice Beschreibung"
                      value={brandVoice}
                      onChange={(val) => {
                        if (val.length <= MAX_CHARS) {
                          setBrandVoice(val);
                          if (errors.brandVoice) {
                            setErrors((e) => ({ ...e, brandVoice: undefined }));
                          }
                        }
                      }}
                      multiline={4}
                      placeholder="z.B. Premium, sachlich, leicht humorvoll, duzt den Kunden. Klare Saetze, keine Fachwoerter."
                      helpText={`${brandVoice.length}/${MAX_CHARS} Zeichen`}
                      autoComplete="off"
                      error={errors.brandVoice}
                    />
                  </Box>

                  {/* Suggestions */}
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Schnellauswahl -- Klicke um hinzuzufuegen:
                    </Text>
                    <InlineStack gap="200" wrap>
                      {BRAND_VOICE_SUGGESTIONS.map((s) => (
                        <Button
                          key={s}
                          size="slim"
                          onClick={() => addSuggestion(s)}
                          variant={
                            brandVoice
                              .toLowerCase()
                              .includes(s.toLowerCase())
                              ? "primary"
                              : undefined
                          }
                        >
                          {s}
                        </Button>
                      ))}
                    </InlineStack>
                  </BlockStack>

                  <Banner tone="info" title="Tipp">
                    <p>
                      Je praeziser du deine Brand Voice beschreibst, desto
                      besser kann die KI deinen Ton treffen. Denke an:
                      Formalitaet (Du/Sie), Emotionalitaet, Fachsprache,
                      Humor.
                    </p>
                  </Banner>
                </BlockStack>
              </div>
            )}

            {/* ====== STEP 1: Target Audience ====== */}
            {step === 1 && (
              <div
                key="step-1"
                style={{
                  animation: `titan-slide-${animDirection === "forward" ? "in-right" : "in-left"} 0.4s ease-out`,
                }}
              >
                <BlockStack gap="500">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h1" alignment="center">
                      Deine Zielgruppe
                    </Text>
                    <Text
                      variant="bodyMd"
                      as="p"
                      alignment="center"
                      tone="subdued"
                    >
                      Wer sind deine Kunden? Die KI passt Sprache und Inhalte
                      an deine Zielgruppe an.
                    </Text>
                  </BlockStack>

                  <Box paddingBlockStart="200">
                    <TextField
                      label="Zielgruppen-Beschreibung"
                      value={targetAudience}
                      onChange={(val) => {
                        if (val.length <= MAX_CHARS) {
                          setTargetAudience(val);
                          if (errors.targetAudience) {
                            setErrors((e) => ({
                              ...e,
                              targetAudience: undefined,
                            }));
                          }
                        }
                      }}
                      multiline={4}
                      placeholder="z.B. Design-affine Millennials, 25-40 Jahre, urban, qualitaetsbewusst, vergleichen online"
                      helpText={`${targetAudience.length}/${MAX_CHARS} Zeichen`}
                      autoComplete="off"
                      error={errors.targetAudience}
                    />
                  </Box>

                  {/* Prompts */}
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h3">
                        Denke an folgende Aspekte:
                      </Text>
                      {AUDIENCE_PROMPTS.map((prompt, i) => (
                        <InlineStack key={i} gap="200" blockAlign="center">
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg, var(--titan-primary, #6366f1), var(--titan-accent, #06b6d4))",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "white",
                              fontSize: "12px",
                              fontWeight: "bold",
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </div>
                          <Text variant="bodyMd" as="p">
                            {prompt}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Card>
                </BlockStack>
              </div>
            )}

            {/* ====== STEP 2: NoGos ====== */}
            {step === 2 && (
              <div
                key="step-2"
                style={{
                  animation: `titan-slide-${animDirection === "forward" ? "in-right" : "in-left"} 0.4s ease-out`,
                }}
              >
                <BlockStack gap="500">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h1" alignment="center">
                      No-Gos definieren
                    </Text>
                    <Text
                      variant="bodyMd"
                      as="p"
                      alignment="center"
                      tone="subdued"
                    >
                      Welche Begriffe, Themen oder Stilmittel sollen vermieden
                      werden?
                    </Text>
                  </BlockStack>

                  <Box paddingBlockStart="200">
                    <TextField
                      label="No-Go Liste"
                      value={noGos}
                      onChange={(val) => {
                        if (val.length <= MAX_CHARS) {
                          setNoGos(val);
                        }
                      }}
                      multiline={4}
                      placeholder="z.B. Keine Superlative wie 'bester/guenstigster', keine Emojis, kein 'Sie', keine Konkurrenz-Erwaehnung"
                      helpText={`${noGos.length}/${MAX_CHARS} Zeichen -- Dieses Feld ist optional`}
                      autoComplete="off"
                    />
                  </Box>

                  <Banner tone="info" title="Beispiele fuer haeufige No-Gos">
                    <BlockStack gap="100">
                      <p>
                        - Uebertriebene Superlative ("das Beste",
                        "einzigartig", "revolutionaer")
                      </p>
                      <p>- Bestimmte Anredeformen (Sie/Du)</p>
                      <p>- Emojis oder Sonderzeichen im Text</p>
                      <p>- Dringlichkeits-Formulierungen ("Nur noch heute!")</p>
                      <p>- Konkurrenz-Vergleiche oder -Erwaehnungen</p>
                      <p>- Englische Begriffe, wenn vermeidbar</p>
                    </BlockStack>
                  </Banner>
                </BlockStack>
              </div>
            )}

            {/* ====== STEP 3: Summary / Schnellstart ====== */}
            {step === 3 && (
              <div
                key="step-3"
                style={{
                  animation: `titan-slide-${animDirection === "forward" ? "in-right" : "in-left"} 0.4s ease-out`,
                }}
              >
                <BlockStack gap="500">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h1" alignment="center">
                      Schnellstart
                    </Text>
                    <Text
                      variant="bodyMd"
                      as="p"
                      alignment="center"
                      tone="subdued"
                    >
                      Ueberpruefe deine Einstellungen oder waehle ein
                      vorgefertigtes Template.
                    </Text>
                  </BlockStack>

                  {/* Summary Cards */}
                  <BlockStack gap="300">
                    <Card>
                      <BlockStack gap="200">
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                        >
                          <Text variant="headingSm" as="h3">
                            Brand Voice
                          </Text>
                          <Button
                            variant="plain"
                            size="slim"
                            onClick={() => {
                              setAnimDirection("back");
                              setStep(0);
                            }}
                          >
                            Bearbeiten
                          </Button>
                        </InlineStack>
                        <Text
                          variant="bodyMd"
                          as="p"
                          tone={brandVoice ? undefined : "subdued"}
                        >
                          {brandVoice || "Noch nicht konfiguriert"}
                        </Text>
                      </BlockStack>
                    </Card>

                    <Card>
                      <BlockStack gap="200">
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                        >
                          <Text variant="headingSm" as="h3">
                            Zielgruppe
                          </Text>
                          <Button
                            variant="plain"
                            size="slim"
                            onClick={() => {
                              setAnimDirection("back");
                              setStep(1);
                            }}
                          >
                            Bearbeiten
                          </Button>
                        </InlineStack>
                        <Text
                          variant="bodyMd"
                          as="p"
                          tone={targetAudience ? undefined : "subdued"}
                        >
                          {targetAudience || "Noch nicht konfiguriert"}
                        </Text>
                      </BlockStack>
                    </Card>

                    <Card>
                      <BlockStack gap="200">
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                        >
                          <Text variant="headingSm" as="h3">
                            No-Gos
                          </Text>
                          <Button
                            variant="plain"
                            size="slim"
                            onClick={() => {
                              setAnimDirection("back");
                              setStep(2);
                            }}
                          >
                            Bearbeiten
                          </Button>
                        </InlineStack>
                        <Text
                          variant="bodyMd"
                          as="p"
                          tone={noGos ? undefined : "subdued"}
                        >
                          {noGos || "Keine No-Gos definiert (optional)"}
                        </Text>
                      </BlockStack>
                    </Card>
                  </BlockStack>

                  {/* Templates */}
                  <Divider />
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3" alignment="center">
                      Oder waehle ein Template:
                    </Text>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      {TEMPLATES.map((template) => (
                        <div
                          key={template.name}
                          className="titan-feature-card"
                          onClick={() => applyTemplate(template)}
                          style={{
                            padding: "16px",
                            cursor: "pointer",
                            border:
                              selectedTemplate === template.name
                                ? "2px solid var(--titan-primary, #6366f1)"
                                : "1px solid rgba(99, 102, 241, 0.1)",
                            borderRadius: "12px",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <BlockStack gap="200">
                            <InlineStack
                              align="space-between"
                              blockAlign="center"
                            >
                              <Text
                                variant="headingSm"
                                as="h4"
                                fontWeight="semibold"
                              >
                                {template.name}
                              </Text>
                              {selectedTemplate === template.name && (
                                <Badge tone="success">Aktiv</Badge>
                              )}
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              {template.brandVoice.slice(0, 60)}...
                            </Text>
                          </BlockStack>
                        </div>
                      ))}
                    </div>
                  </BlockStack>

                  {/* Ready Banner */}
                  <Banner tone="success" title="Bereit zum Start">
                    <BlockStack gap="100">
                      <p>
                        Deine Brand DNA wird gespeichert und steuert alle
                        zukuenftigen KI-Optimierungen.
                      </p>
                      <p>
                        Du hast 5 kostenlose Optimierungen im Starter-Plan.
                      </p>
                    </BlockStack>
                  </Banner>
                </BlockStack>
              </div>
            )}

            {/* Navigation Buttons */}
            <div style={{ marginTop: "32px" }}>
              <InlineStack align="space-between" blockAlign="center">
                <div>
                  {step > 0 ? (
                    <Button onClick={goBack}>Zurueck</Button>
                  ) : (
                    <Button
                      variant="plain"
                      onClick={() => navigate("/app")}
                    >
                      Spaeter einrichten
                    </Button>
                  )}
                </div>

                <div>
                  <InlineStack gap="200">
                    {step > 0 && step < totalSteps - 1 && (
                      <Button
                        variant="plain"
                        onClick={() => navigate("/app")}
                      >
                        Spaeter einrichten
                      </Button>
                    )}
                    {step < totalSteps - 1 ? (
                      <Button variant="primary" onClick={goNext}>
                        Weiter
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="large"
                        onClick={handleFinish}
                      >
                        Jetzt starten
                      </Button>
                    )}
                  </InlineStack>
                </div>
              </InlineStack>
            </div>
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes titan-slide-in-right {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes titan-slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </Page>
  );
}
