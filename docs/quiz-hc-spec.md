# Quiz Hospital Capilar — Documentación de Producción

**Stack:** Astro SSR + React 19 + Firestore + GHL + Stripe + Koibox + PostHog
**Lanzamiento:** 2026-05-11

## Ownership

| Área | Owner | Responsabilidad |
|---|---|---|
| Funnel general / código quiz | Philippe (Growth4U) | Arquitectura, deploy, código |
| Workflows GHL & automations | **Ramiro (Growth4U)** | Triggers, pipelines, sequences |
| Validación técnica + Dashboard | **Martin (Growth4U)** | QA E2E, métricas, BI |
| Meta Ads operativa | Miguel (HC) | Campañas, lead forms, Pixel |
| Asesoría comercial | Noemí + hermano de Óscar (HC) | Videollamadas, WhatsApp, cierre |
| Dirección médica | Dr. responsable HC | Validación clínica protocolos |

---

## 1. Arquitectura del Flujo

```
Anuncio Meta (mujer / nicho específico)
     │
     ▼
Meta Lead Form (6 campos)
   • Sexo (mujer/hombre)
   • ¿Preocupado/a por caída? (si/no)
   • Ciudad (madrid/murcia/pontevedra/otra)
   • Nombre (autofill)
   • Email (autofill)
   • Teléfono (autofill)
     │
     ├──► GHL nativo (lead creado con custom fields)
     │
     └──► Thank-you redirect →
              /quiz-hospitalcapilar/?v=...&caida=...&ciudad=...&nombre=...&email=...&telefono=...&leadId=...&utm_*=...
                   │
                   ├──► Si v=mujer (5 preguntas)
                   │     ▼
                   │   P1 Tiempo · P2 Patrón · P3 Origen · P4 Tratamientos · P5 Objetivo
                   │     ▼ Scoring CRT vs HRT
                   │     ▼ Resultado: Protocolo CRT o HRT + bloque Hair Pro + disclaimer Tricometabólico
                   │     │
                   │     ├── CTA primario → Calendario HC Videollamadas (GHL prefilled)
                   │     │                    → cita en Gmail de Noemí
                   │     │                    → videollamada con asesora
                   │     │                    → cobro 125€ Stripe / 195€ clínica
                   │     │
                   │     └── CTA secundario → WhatsApp (+34 623 457 218)
                   │
                   └──► Si v=hombre (3 preguntas)
                         P1 Tiempo · P2 Patrón Norwood · P3 Tratamientos
                         ▼ Resultado: Asesoría presencial gratuita
                         └── CTA → WhatsApp (Koibox embed pendiente)
```

---

## 2. Meta Lead Form

### Campos del form

| # | Campo | Tipo | Nombre interno (slug) | Opciones / Valor |
|---|---|---|---|---|
| 1 | Sexo | Single select | `sexo` | `mujer` / `hombre` |
| 2 | ¿Estás preocupado/a por tu caída? | Single select | `caida` | `si` / `no` |
| 3 | ¿En qué ciudad vives? | Single select | `ciudad` | `madrid` / `murcia` / `pontevedra` / `otra` |
| 4 | Nombre | Autofill | `full_name` | — |
| 5 | Email | Autofill | `email` | — |
| 6 | Teléfono | Autofill | `phone_number` | — |

### Intro screen

```
Deja de adivinar qué le pasa a tu pelo

Test online en 5 preguntas. Te decimos qué tratamiento necesita tu caso
y agendas asesoría gratuita con nuestro equipo médico.

⏰ 1 minuto · 100% gratis · Sin compromiso
👩🏻‍⚕️ Validado por médicos especialistas
```

### Thank-you screen

- **Botón CTA:** `Empezar mi diagnóstico`
- **Redirect URL:**

```
https://diagnostico.hospitalcapilar.com/quiz-hospitalcapilar/?v={{form.sexo}}&caida={{form.caida}}&ciudad={{form.ciudad}}&nombre={{form.full_name}}&email={{form.email}}&telefono={{form.phone_number}}&leadId={{lead_id}}&utm_source=meta&utm_medium=lead_form&utm_campaign={{ad.campaign.name}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

---

## 3. GHL Setup

### Custom fields creados (2026-05-07)

| Field Name | ID | Type | Picklist |
|---|---|---|---|
| Sexo Lead Form | `ySOJCraPl26CR161KFxW` | SINGLE_OPTIONS | mujer, hombre |
| Preocupacion caida | `hLiD1jVS5UkzJUjLWo8g` | SINGLE_OPTIONS | si, no |

### Custom fields preexistentes relevantes

| Field Name | ID | Type |
|---|---|---|
| Door | `2JYlfGk60lHbuyh9vcdV` | SINGLE_OPTIONS |
| ECP | `cFIcdJlT9sfnC3KMSwDD` | TEXT |
| utm_source / medium / campaign / content / term | varios | TEXT |
| Funnel Type | `liIshAFJMngl2BV9MtVw` | TEXT |
| Traffic Source | `miu6E3oxZowYahYGjX1A` | TEXT |
| contact_score | `SGT17lKk7bZgkInBTtrT` | NUMERICAL |
| Qué ha hecho por la caída | `P2GSHqir1PRJKMihQx1h` | TEXT |

### Calendarios

| Calendar | ID | Type | Uso |
|---|---|---|---|
| **Calendario HC Videollamadas** | `kZbXjtt6kmjj1phXdoqP` | personal | CTA mujer post-quiz → Gmail de Noemí |
| Calendario HC | `sMbNt8SyzfjroMbZvB74` | class_booking | Citas presenciales clínica |

### Pipeline Leads HC

```
1. New Lead          fbed92b1-...   ← lead form submit
2. Contacted         f0b2e24c-...   ← asesora primer contacto WhatsApp
3. Videocall booked  <TBD>          ← videollamada agendada (Calendario HC Videollamadas)
4. Paid              2eac8c05-...   ← pagó 125€ Stripe online
5. Booked            f9e5c1cf-...   ← cita presencial agendada en Koibox
6. Reminder sent     24956338-...   ← recordatorio 24h antes
7. Attended          71a5cc36-...   ← vino a la cita en clínica
8. Won               1cd97c60-...   ← compró tratamiento
9. No-show           437d0663-...   ← no vino a la cita
10. Lost/Cancelled   c961b576-...   ← cancelado
11. Abandoned        28227d12-...   ← sin respuesta
```

**Nota:** la stage `Videocall booked` debe crearse manualmente en GHL UI (la API key no tiene permiso de escritura sobre pipelines). Una vez creada, actualizar este doc con su ID.

---

## 4. Quiz Corto — Rama MUJER (5 preguntas + resultado)

### Framework clínico (validado por dirección médica 2026-05-07)

- **CRT (PRP)** → efluvios telógenos, cuadros transitorios, postparto, estrés, dieta, enfermedad
- **HRT (dutasterida intradérmica)** → androgenética real (patrón Ludwig, antecedentes, evolución >1 año)
- **Hair Pro** → booster del cuero cabelludo, combinable con CRT o HRT

### P1 · ¿Hace cuánto pierdes pelo?

| Opción | Score |
|---|---|
| <3 meses | +2 CRT |
| 3-12 meses | +1 CRT |
| 1-3 años | +2 HRT |
| >3 años | +3 HRT |

### P2 · ¿Dónde notas más la pérdida?

| Opción | Score |
|---|---|
| Raya central / parte superior | +3 HRT |
| Sienes y línea frontal | +3 CRT |
| Difuso por toda la cabeza | +3 HRT + 🚩 flag médico |
| Zonas localizadas (parches) | +2 HRT + 🚩 flag médico |
| No lo tengo claro | 0 |

### P3 · ¿Identificas alguna causa?

| Opción | Score |
|---|---|
| Embarazo o postparto | +3 CRT |
| Menopausia o perimenopausia | +3 HRT + 🚩 flag médico |
| Problema hormonal diagnosticado | +3 HRT + 🚩 flag médico |
| Estrés / dieta / enfermedad reciente | +3 CRT |
| Antecedentes familiares de calvicie | +3 HRT |
| No identifico causa | 0 |

### P4 · ¿Has probado algo? *(sin scoring, contextual)*

- Minoxidil / finasterida sin resultado
- PRP / mesoterapia en otra clínica
- Champús / vitaminas / productos casa
- Tratamiento hormonal
- Nada todavía

### P5 · ¿Qué buscas conseguir? *(sin scoring)*

- Frenar caída
- Recuperar densidad
- Entender qué me pasa

### Lógica de decisión

```
Sumar puntos CRT y HRT (solo P1, P2, P3)
SI diff(CRT, HRT) ≥ 2 → gana el mayor
SI diff < 2 → HRT por defecto
SI flag médico activo → marca al asesor + nota visible
```

### Pantalla resultado mujer

- Header: "Pre-recomendación: Protocolo {CRT|HRT}"
- 3 bullets: qué hace, indicado para ti porque, resultado esperado
- Si `flag === true` → banner ámbar "Tu caso necesita atención especializada"
- Bloque "Combinable con Hair Pro"
- Disclaimer Tricometabólico
- **CTA primario:** "Agenda una videollamada con nuestro equipo médico" → `kZbXjtt6kmjj1phXdoqP` con prefill
- **CTA secundario:** "Hablar por WhatsApp con una asesora" → wa.me/34623457218

---

## 5. Quiz Corto — Rama HOMBRE (3 preguntas + resultado)

**Sin scoring** — solo data clínica para el médico.

- **P1** · ¿Hace cuánto pierdes pelo? (Menos de 3m / 3-12m / 1-3a / Más de 3a)
- **P2** · ¿Cómo describes tu pérdida? Escala Norwood (Entradas leves / Entradas marcadas / Coronilla afectada / Avanzado)
- **P3** · ¿Has probado algo antes? (Minoxidil / Finasterida / PRP otra clínica / Trasplante / Productos casa / Nada)

### Pantalla resultado hombre

"Asesoría presencial gratuita con nuestro equipo médico":
- **CTA primario:** "Agenda tu asesoría presencial gratuita" → redirige a `/agendar` (Koibox-backed) con `tipo=asesoria` (bypass del bono gate), `clinica` desde el Meta form, y nombre/email/phone/contactId prerellenados.
- **CTA secundario:** "Hablar por WhatsApp con una asesora" → wa.me/34623457218.

⚠ Actualmente solo Madrid está habilitada en `AgendarPage.jsx`. Murcia y Pontevedra están comentadas para piloto — descomentar cuando estén operativas.

---

## 6. URLs de referencia

| URL | Uso |
|---|---|
| `https://diagnostico.hospitalcapilar.com/quiz-hospitalcapilar/` | Landing + quiz (orgánico) |
| `?v=mujer` / `?v=hombre` | Preselecciona rama desde Meta |
| `https://api.leadconnectorhq.com/widget/booking/kZbXjtt6kmjj1phXdoqP` | Calendario videollamadas |
| `https://wa.me/34623457218` | WhatsApp asesora |

---

## 7. Plan de medición

### 7.1 Funnel y sources of truth

| # | Etapa | Source of truth | Métrica clave |
|---|---|---|---|
| 1 | Impresión anuncio | Meta Ads / Google Ads | Impressions, frequency |
| 2 | Clic anuncio | Meta / Google + UTMs | CTR, CPC |
| 3 | Lead form abierto | Meta Ads | Form opens |
| 4 | Lead form submit | Meta Ads + GHL Contact | CPL, lead volume |
| 5 | Redirect a quiz | PostHog `$pageview` `/quiz-hospitalcapilar/` | Drop-off Meta→quiz (~30-40%) |
| 6 | Quiz iniciado | PostHog `diagnostic_quiz_started` | Start rate |
| 7 | Quiz completado | PostHog `diagnostic_quiz_completed` + Firestore | Completion rate |
| 8 | CTA cita pulsado | PostHog `diagnostic_quiz_cta_clicked` | Click rate calendar vs WhatsApp |
| 9 | Videollamada agendada | GHL Calendar (kZbXjtt6kmjj1phXdoqP) + Pipeline `Videocall booked` | Booking rate |
| 10 | Videollamada atendida | GHL (asesora actualiza manualmente o automation) | Show-up rate |
| 11 | Pago 125€ Stripe | Stripe webhook → GHL Pipeline `Paid` | Conversion rate |
| 12 | Cita Koibox presencial | Koibox API → Firestore `bookings` + Pipeline `Booked` | Booking físico |
| 13 | Cita atendida | GHL Pipeline `Attended` | Show-up clínica |
| 14 | Tratamiento vendido | GHL Pipeline `Won` + Salesforce | Revenue / venta |

### 7.2 Eventos PostHog actuales (implementados)

```javascript
diagnostic_quiz_prefilled_sex    { sexo }
diagnostic_quiz_started          { nicho, sexo }
diagnostic_quiz_sex_selected     { sexo }
diagnostic_quiz_completed        { nicho, sexo, result: {protocol, flag, scores} }
diagnostic_quiz_cta_clicked      { sexo, protocol, channel: 'ghl_calendar'|'whatsapp' }
```

### 7.3 Eventos a añadir (gap)

```javascript
diagnostic_quiz_question_answered    { sexo, questionId, answer, step, totalSteps }
diagnostic_quiz_landing_viewed       { nicho, source: 'meta'|'organic' }
ghl_appointment_booked               // vía webhook GHL → backend → PostHog
stripe_payment_completed             { amount, contactId }
koibox_appointment_created           { city, calendarId, ghlContactId }
treatment_purchased                  { protocol, amount, contactId }
```

### 7.4 Atribución cross-system

```
Meta Ad URL (utm_source=meta&...)
  │
  ├──► Meta Lead Form thank-you URL preserva UTMs como params
  │     │
  │     └──► /quiz-hospitalcapilar/ → URL params persisten en Firestore quiz_leads.source
  │           │
  │           └──► PostHog $set y trackQuizStarted con UTMs
  │
  └──► Meta → GHL native integration → GHL custom fields utm_source/medium/etc
        │
        └──► GHL Calendar event hereda contact.customFields
              │
              └──► Stripe metadata.utm_source (si se setea al crear checkout)
                    │
                    └──► Koibox sync (vía GHL relay) preserva atribución original
```

### 7.5 KPIs por etapa (target fase 1)

| Etapa | Tasa target | Tiempo validar |
|---|---|---|
| CTR anuncio | ≥2% | Diaria, 200 imp |
| Submit form | ≥30% del clic | Diaria, 100 clics |
| Quiz iniciado / lead | ≥60% | 3 días |
| Quiz completado | ≥60% del iniciado | 3-5 días, 100 starts |
| Click CTA cita | ≥40% del completado | Semanal |
| Cita agendada | ≥60% del click | Semanal |
| Cita atendida | ≥60% de la agendada | Semanal |
| Pago 125€ | ≥40% de la atendida | Quincenal |
| Venta tratamiento | ≥40% del 125€ | Quincenal |

**CAC target:** ≤270€ (con ticket medio 900€).

### 7.6 Dashboard a construir

Sección `/quiz-hc` en el package `dashboard`:

1. **Funnel chart** (PostHog Funnels): pageview → quiz_started → completed → cta_clicked → ghl_booked
2. **Por canal (UTM):** mismo funnel agrupado por `utm_source`, `utm_campaign`
3. **Por sexo:** mujer vs hombre, conversión por rama
4. **Distribución CRT vs HRT:** % de mujeres que terminan en cada protocolo
5. **Flagged leads:** leads con flag médico para revisión manual
6. **CAC por canal:** spend Meta + Google / ventas atribuidas
7. **Tiempo lead → venta:** distribución del lag entre cada etapa

### 7.7 Stripe — tracking de pagos

Webhook Stripe → Netlify function → Firestore `stripe_payments` + PostHog event `stripe_payment_completed`. Asociar al `ghl_lead_id` via `customer_email` o `metadata.ghl_contact_id`.

Ya existe parcialmente en `netlify/functions/` — verificar y completar.

### 7.8 Koibox — tracking de citas presenciales

Sync existente Koibox → Firestore guarda en `bookings`. Cross-reference contra `quiz_leads` por teléfono o email para atribuir al canal original.

---

## 8. Estado del proyecto

### ✅ DONE (en producción)

| Item | Owner |
|---|---|
| Quiz `/quiz-hospitalcapilar/` con rama mujer (5 preguntas) y hombre (3 preguntas) | Philippe |
| Scoring CRT/HRT con lógica clínica validada | Philippe + Dr. HC |
| Pantalla resultado mujer con bloque Hair Pro + disclaimer Tricometabólico | Philippe |
| CTA mujer → Calendario HC Videollamadas con prefill | Philippe |
| CTA secundario WhatsApp en mujer y hombre | Philippe |
| CTA hombre → `/agendar` Koibox existente con `tipo=asesoria` | Philippe |
| Custom fields GHL `Sexo Lead Form` + `Preocupacion caida` | Philippe |
| URL Meta thank-you con macros `{{form.sexo}}` etc. | Miguel |
| Mapping Meta form → GHL contact via integración nativa | Miguel |
| Tracking PostHog: `diagnostic_quiz_started/completed/cta_clicked` | Philippe |
| UTM propagation Meta → quiz → Firestore | Philippe |
| Deploy a producción (`diagnostico.hospitalcapilar.com/quiz-hospitalcapilar/`) | Philippe |

### 🟡 IN PROGRESS (esta semana)

| Item | Owner | Bloqueante? |
|---|---|---|
| **Crear stage `Videocall booked` en pipeline GHL UI** | **Ramiro** | 🔴 Sí — antes de campaña |
| **Workflow GHL: appointment booked → mover a `Videocall booked`** | **Ramiro** | 🟡 Recomendado |
| **Workflow GHL: appointment attended → mover a stage adecuada** | **Ramiro** | 🟡 Recomendado |
| **Test E2E con lead real Meta → quiz → calendar** | Miguel envía + **Martin valida** | 🔴 Sí — antes de campaña |
| Descomentar Murcia + Pontevedra en `AgendarPage.jsx` cuando clínicas estén operativas | Philippe | 🟢 No bloquea Madrid |

### 🟢 PENDING (próximo sprint)

| Item | Owner |
|---|---|
| Conectar GHL custom field submit del quiz (protocolo CRT/HRT → campo nuevo) | Philippe |
| Webhook backup Meta → backend (no perder leads que no clican thank-you, ~30-40%) | Philippe |
| **Dashboard funnel completo en `/quiz-hc`** | **Martin** |
| **Validación métricas end-to-end (Meta → PostHog → GHL → Stripe → Koibox)** | **Martin** |
| Eventos PostHog granulares: `diagnostic_quiz_question_answered`, `diagnostic_quiz_landing_viewed` | Philippe |
| Webhook GHL appointment → PostHog `ghl_appointment_booked` | Philippe + Ramiro |
| Webhook Stripe → PostHog `stripe_payment_completed` con `ghl_contact_id` en metadata | Philippe |
| Sync Koibox appointment → PostHog `koibox_appointment_created` | Philippe |

### 🚦 Checklist pre-campaña (antes de gastar €1.800 en Meta)

- [ ] **Ramiro:** stage `Videocall booked` creada en pipeline + workflow asociado
- [ ] **Miguel:** lead form Meta apunta a URL correcta + macros `{{form.sexo/caida/ciudad}}` resueltos
- [ ] **Miguel envía lead de prueba real**
- [ ] **Martin valida E2E:**
  - [ ] GHL contact creado con `Sexo Lead Form`, `Preocupacion caida`, `City` mapeados
  - [ ] Lead llega a `/quiz-hospitalcapilar/?v=...` con todos los params
  - [ ] Firestore `quiz_leads` guarda el lead con UTMs intactos
  - [ ] Quiz completado dispara PostHog event correcto
  - [ ] CTA mujer abre calendar con `first_name/email/phone` prerellenados
  - [ ] Booking en calendar crea evento en Gmail de Noemí
  - [ ] CTA hombre redirige a `/agendar` con prefill correcto
- [ ] Si todos los checks pasan → green light para campaña real
- [ ] Si alguno falla → Philippe arregla + Martin re-valida
