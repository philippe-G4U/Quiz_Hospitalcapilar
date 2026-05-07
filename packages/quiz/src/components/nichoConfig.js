// ============================================
// SHARED NICHO CONFIGURATIONS
// Used by both NichoLanding (quiz) and DirectFormLanding (form)
// ============================================

const YOLANDA_VIDEO_TESTIMONIAL = {
  src: 'https://res.cloudinary.com/dsc0jsbkz/video/upload/v1777898178/YOLANDA_TESTIMONIO_rv2tei.mp4',
  name: 'Yolanda',
  label: 'Paciente Hospital Capilar',
};

export const NICHOS = {
  // ─── El Espejo — Joven 20-28 ──────────────────────────────
  'el-espejo': {
    slug: 'el-espejo',
    door: 'landing_el_espejo',
    badge: 'Alopecia Temprana: Actúa Antes',
    headline: '¿Cada mañana ves las entradas avanzar?',
    subheadline: 'Tienes 20-28 años y ya notas que el pelo retrocede. Tu padre es calvo y temes que te pase lo mismo. Cuanto antes actúes, más pelo conservas.',
    ctaQuiz: 'Evalúa tu caso en 3 minutos',
    ctaForm: 'SOLICITAR VALORACIÓN GRATUITA',
    ecp: 'El Espejo',
    stats: [
      { value: '25%', label: 'de hombres notan caída antes de los 25' },
      { value: '95%', label: 'de éxito si se trata a tiempo' },
      { value: '3 min', label: 'para saber dónde estás' },
    ],
    painPoints: [
      '¿Las entradas cada vez más atrás?',
      '¿Tu padre o abuelo perdió el pelo y temes que te pase igual?',
      '¿Has buscado en TikTok o Reddit pero no sabes qué es fiable?',
      '¿Te da cosa ir a una clínica porque crees que te van a vender algo?',
    ],
    testimonials: [
      { name: 'Alejandro R.', age: 22, text: 'Tenía 20 años y cada mañana veía las entradas peor. Mi padre es calvo. En HC me explicaron todas las opciones reales sin presión.', stars: 5 },
      { name: 'Daniel P.', age: 26, text: 'No quería acabar como mi padre. Fui a tiempo, me hicieron un test capilar completo y ahora tengo un plan que funciona.', stars: 5 },
    ],
    solution: 'No vendemos cirugías a jóvenes que no las necesitan. Primero el test capilar con microscopio + analítica. Después te explicamos todas las opciones reales — sin presión.',
    faqs: [
      { q: '¿A los 20 ya puedo perder el pelo?', a: 'Sí. El 25% de los hombres empiezan a notar caída antes de los 25. La genética, las hormonas y el estrés pueden acelerar el proceso.' },
      { q: '¿Si mi padre es calvo, yo también lo seré?', a: 'No necesariamente. La genética influye, pero no determina al 100%. Un test capilar temprano permite frenar o retrasar la caída significativamente.' },
      { q: '¿Es muy pronto para un trasplante?', a: 'Depende. En muchos casos, a los 20-25 es mejor estabilizar la caída con tratamiento médico antes de plantearse una cirugía. Te lo explicamos sin presión.' },
      { q: '¿Los tratamientos tienen efectos secundarios?', a: 'Existen opciones con y sin efectos secundarios. Nuestros médicos te explican cada opción, sus pros y contras, para que tomes una decisión informada.' },
    ],
    tags: ['nicho-el-espejo'],
  },

  // ─── Es Normal — Mujer menopausia/perimenopausia 45-55 ────
  'es-normal': {
    slug: 'es-normal',
    door: 'landing_es_normal',
    badge: 'Especialistas en Alopecia Femenina',
    headline: '¿Tu médica dice que tu caída es "normal"?',
    subheadline: 'Desde la menopausia se te cae a puñados. Llevas un año y cada vez peor. El 40% de las mujeres sufre pérdida de pelo — y el 80% está mal diagnosticada.',
    ctaQuiz: 'Descubre qué le pasa a tu pelo',
    ctaForm: 'SOLICITAR VALORACIÓN',
    ecp: 'Es Normal',
    stats: [
      { value: '40%', label: 'de mujeres sufren caída capilar' },
      { value: '80%', label: 'mal diagnosticadas la primera vez' },
      { value: '30 min', label: 'test capilar integral completo' },
    ],
    painPoints: [
      '¿Notas que se te ve el cuero cabelludo?',
      '¿Llevas meses probando champús y suplementos sin resultado?',
      '¿Te dijeron que "es normal" pero tú sabes que no lo es?',
      '¿Crees que puede ser hormonal (menopausia, SOP, tiroides) pero nadie lo ha evaluado?',
    ],
    testimonials: [
      { name: 'Laura M.', age: 52, text: 'Desde la menopausia se me caía a puñados. Mi médica decía que era normal. En Hospital Capilar cruzaron mi perfil hormonal con tricoscopía y encontraron la causa real.', stars: 5 },
      { name: 'Patricia G.', age: 48, text: 'Llevaba un año con caída brutal. Me dijeron que era por la edad. En HC descubrieron un desbalance hormonal tratable. Por fin alguien me escuchó.', stars: 5 },
    ],
    videoTestimonial: YOLANDA_VIDEO_TESTIMONIAL,
    solution: 'Tu pelo y tus hormonas están conectados — y nuestro equipo los analiza juntos. Cruzamos tu perfil hormonal (menopausia, SOP, Hashimoto) con un estudio capilar completo.',
    faqs: [
      { q: '¿Es normal que se me caiga el pelo en la menopausia?', a: 'Es frecuente, pero NO es "normal" y no tienes que aceptarlo. Un test capilar con analítica hormonal + tricoscopía identifica la causa exacta y las opciones de tratamiento.' },
      { q: '¿La caída por hormonas tiene solución?', a: 'En la mayoría de casos, sí. Pero necesitamos una analítica hormonal cruzada con un estudio capilar para identificar la causa exacta y diseñar el tratamiento correcto.' },
      { q: '¿Qué incluye la valoración?', a: 'Tricoscopía digital (microscopio capilar), revisión de tu historial hormonal, valoración médica personalizada y plan de acción. Todo en 30 minutos.' },
      { q: '¿Me van a intentar vender algo?', a: 'No. Nuestros médicos te diagnostican y te explican tus opciones. Si no necesitas tratamiento, te lo decimos. Sin presión comercial.' },
    ],
    tags: ['nicho-es-normal'],
  },

  // ─── Lo Que Vino Con el Bebé — Postparto 28-38 ───────────
  postparto: {
    slug: 'postparto',
    door: 'landing_postparto',
    badge: 'Caída Capilar Postparto',
    headline: '¿Se te cae el pelo desde el embarazo y nadie te da respuestas?',
    subheadline: 'Han pasado más de 6 meses y sigue cayendo. Tu ginecóloga dice que es normal. El efluvio postparto afecta al 50% de madres — pero a veces revela algo más.',
    ctaQuiz: 'Descubre si es temporal o algo más',
    ctaForm: 'SOLICITAR VALORACIÓN',
    ecp: 'Lo Que Vino Con el Bebé',
    stats: [
      { value: '50%', label: 'de madres sufren caída postparto' },
      { value: '85%', label: 'se recuperan con tratamiento adecuado' },
      { value: '6 meses', label: 'clave para actuar a tiempo' },
    ],
    painPoints: [
      '¿Pierdes mechones de pelo desde que diste a luz?',
      '¿Han pasado +6 meses y sigue sin recuperarse?',
      '¿Te dijeron que es normal pero tú ves que cada vez va a peor?',
      '¿Sientes que las clínicas capilares son "para hombres"?',
    ],
    testimonials: [
      { name: 'Elena R.', age: 32, text: 'Después del parto se me caía a puñados. 8 meses después seguía igual. En HC descubrieron que tenía AGA subyacente. Gracias a actuar a tiempo estoy recuperando densidad.', stars: 5 },
      { name: 'Sofía T.', age: 29, text: 'Creía que nunca iba a volver a tener mi pelo de antes. El test en HC me tranquilizó: era efluvio temporal. Me dieron un plan y en 4 meses estaba como antes.', stars: 5 },
    ],
    videoTestimonial: YOLANDA_VIDEO_TESTIMONIAL,
    solution: 'Cruzamos tu perfil hormonal postparto con un estudio capilar completo. Si es efluvio temporal, te lo decimos. Si hay una alopecia subyacente, actuamos a tiempo.',
    faqs: [
      { q: '¿Es normal perder pelo después del parto?', a: 'Sí, el efluvio postparto es muy común. Pero si la caída persiste más de 6 meses, puede haber una alopecia subyacente que necesita tratamiento.' },
      { q: '¿Cuándo debería preocuparme?', a: 'Si llevas más de 4-6 meses con caída intensa, si notas zonas con menos densidad, o si el pelo no vuelve a crecer, es momento de hacer un test capilar.' },
      { q: '¿Los tratamientos son compatibles con la lactancia?', a: 'Sí. Existen tratamientos seguros durante la lactancia. Nuestros médicos te indican opciones que no afectan al bebé.' },
      { q: '¿Mi pelo volverá a ser como antes?', a: 'En la mayoría de casos, sí. Si es efluvio temporal, se recupera solo o con ayuda. Si hay AGA, el tratamiento temprano frena la caída y recupera densidad.' },
    ],
    tags: ['nicho-postparto'],
  },

  // ─── ¿Qué Me Pasa? — Gateway sin diagnóstico ─────────────
  'que-me-pasa': {
    slug: 'que-me-pasa',
    door: 'landing_que_me_pasa',
    badge: '¿Por Qué Se Me Cae el Pelo?',
    headline: 'Se te cae el pelo y no sabes por qué',
    subheadline: 'Google te asusta más de lo que te ayuda. No sabes si es estrés, genético o algo peor. El 70% de las personas con caída no tienen diagnóstico. Tú puedes ser una de ellas.',
    ctaQuiz: '¿Qué me pasa? Descúbrelo en 3 min',
    ctaForm: 'SOLICITAR VALORACIÓN',
    ecp: '¿Qué Me Pasa?',
    stats: [
      { value: '70%', label: 'de afectados no tiene diagnóstico' },
      { value: '20+', label: 'tipos de alopecia con tratamientos distintos' },
      { value: '3 min', label: 'para orientar tu caso' },
    ],
    painPoints: [
      '¿Se te cae el pelo y no sabes si es grave?',
      '¿Has buscado en Google y cada página te asusta más?',
      '¿No sabes si es estrés, genético, hormonal o algo peor?',
      '¿No sabes a qué profesional acudir ni por dónde empezar?',
    ],
    testimonials: [
      { name: 'María J.', age: 35, text: 'No sabía si era estrés o algo peor. Google me asustaba. En HC en 30 minutos supe exactamente qué tenía y qué hacer. El alivio fue enorme.', stars: 5 },
      { name: 'Pablo R.', age: 31, text: 'Llevaba meses preocupado sin saber a quién ir. El quiz me orientó y el test capilar me quitó todas las dudas. Era mucho menos grave de lo que pensaba.', stars: 5 },
    ],
    solution: 'No necesitas buscar más en Google. Un test capilar profesional con tricoscopía + analítica en 30 minutos te dice exactamente qué tienes y qué opciones hay.',
    faqs: [
      { q: '¿Cómo sé si mi caída es normal o grave?', a: 'Perder 50-100 cabellos al día es fisiológico. Si notas más caída de lo habitual, claros, o menos densidad, un test capilar profesional te saca de dudas en 30 minutos.' },
      { q: '¿Puede ser estrés?', a: 'Sí, el estrés puede causar efluvio telógeno. Pero también puede coincidir con alopecia genética u hormonal. Solo un test capilar diferencia una cosa de otra.' },
      { q: '¿Necesito ir al dermatólogo o a una clínica capilar?', a: 'Un centro especializado en salud capilar combina tricoscopía + analítica + valoración médica. Es el test capilar más completo que existe para caída capilar.' },
      { q: '¿El test capilar duele?', a: 'No. La tricoscopía es un microscopio que se apoya en el cuero cabelludo. Es completamente indoloro y dura 15-20 minutos.' },
    ],
    tags: ['nicho-que-me-pasa'],
  },

  // ─── Ya Me Engañaron — Insatisfecho otra clínica ──────────
  'ya-me-engañaron': {
    slug: 'ya-me-engañaron',
    door: 'landing_ya_me_engañaron',
    badge: 'Segunda Opinión Capilar',
    headline: '¿Pagaste miles de euros y no viste resultados?',
    subheadline: 'En Svenson te presionaron. En Insparya no funcionó. Ya no te fías de nadie. Lo entendemos. Hospital Capilar es un centro médico, no un centro estético.',
    ctaQuiz: 'Evalúa tu caso sin compromiso',
    ctaForm: 'QUE ME LLAMEN SIN COMPROMISO',
    ecp: 'Ya Me Engañaron',
    stats: [
      { value: '35%', label: 'de pacientes vienen de otra clínica' },
      { value: '0', label: 'presión comercial en el test capilar' },
      { value: '100%', label: 'transparencia con tu test capilar' },
    ],
    painPoints: [
      '¿Te prometieron resultados que nunca llegaron?',
      '¿Sientes que te vendieron un tratamiento sin diagnosticarte bien?',
      '¿Pagaste €1.000-5.000 y no viste cambio?',
      '¿Necesitas una opinión médica real, sin compromiso ni presión?',
    ],
    testimonials: [
      { name: 'Miguel A.', age: 42, text: 'Pagué €3.500 en Svenson, cero resultados. En Insparya me presionaron para operar. En HC me explicaron por qué falló y qué opciones reales tenía. Por primera vez la verdad.', stars: 5 },
      { name: 'Roberto S.', age: 35, text: 'Fui a 3 clínicas antes. Todas me vendían lo mismo sin hacerme un estudio serio. En Hospital Capilar me hicieron tricoscopía, analítica y me explicaron todo con datos.', stars: 5 },
    ],
    solution: 'No hacemos consultas comerciales. Nuestros médicos no cobran comisión. Te diagnostican con datos (tricoscopía + analítica) y te dicen la verdad sobre tu caso, te guste o no.',
    faqs: [
      { q: '¿Puedo arreglar un trasplante mal hecho?', a: 'En muchos casos sí. Primero evaluamos el estado actual con tricoscopía y determinamos qué opciones hay. Cada caso es diferente.' },
      { q: '¿Me van a intentar vender otra cirugía?', a: 'No. Nuestros médicos te explican qué se puede y qué no se puede hacer. Si la mejor opción es no intervenir, te lo decimos.' },
      { q: '¿Es confidencial?', a: 'Absolutamente. Todo lo que compartas con nuestro equipo médico es confidencial. No necesitas decirnos dónde te operaste si no quieres.' },
      { q: '¿Cuánto cuesta la segunda opinión?', a: 'Te llamamos sin compromiso para entender tu caso. El test capilar presencial incluye un análisis completo con datos objetivos.' },
    ],
    tags: ['nicho-ya-me-engañaron'],
  },

  // ─── La Farmacia — OTC frustrado 2-4 años ────────────────
  'farmacia-sin-salida': {
    slug: 'farmacia-sin-salida',
    door: 'landing_farmacia_sin_salida',
    badge: 'Cuando los Productos No Funcionan',
    headline: '¿Llevas años gastando en champús anticaída y nada funciona?',
    subheadline: 'Olistic, Iraltone, Pilexil, minoxidil... €500+ tirados. El problema no son los productos — es que nunca te diagnosticaron por qué se te cae el pelo.',
    ctaQuiz: 'Descubre por qué no funciona',
    ctaForm: 'SOLICITAR VALORACIÓN',
    ecp: 'La Farmacia',
    stats: [
      { value: '60%', label: 'no responden a minoxidil sin test capilar' },
      { value: '€500+', label: 'gasto medio antes del test capilar' },
      { value: '30 min', label: 'para saber qué necesitas realmente' },
    ],
    painPoints: [
      '¿Llevas +2 años con champús y suplementos anticaída?',
      '¿Has gastado €500+ en productos que no funcionan?',
      '¿Minoxidil, finasteride... y sigue cayendo?',
      '¿Estás en el punto de "o hago algo de verdad o lo dejo"?',
    ],
    testimonials: [
      { name: 'Carlos M.', age: 38, text: 'Llevaba 3 años gastando en Olistic, champús, minoxidil. €800 tirados. En HC descubrieron que mi alopecia era mixta. Cambiaron el tratamiento y en 6 meses noté la diferencia.', stars: 5 },
      { name: 'Andrea L.', age: 33, text: 'Probé todo lo de la farmacia durante 2 años. Nada. En Hospital Capilar me dijeron exactamente por qué no funcionaba y qué sí iba a funcionar.', stars: 5 },
    ],
    solution: 'Sin un test capilar, cualquier producto es una apuesta. Hacemos tricoscopía + analítica para identificar tu tipo exacto de alopecia y diseñar un tratamiento que funcione de verdad.',
    faqs: [
      { q: '¿Por qué el minoxidil no me funciona?', a: 'Hay más de 20 tipos de alopecia. Si no sabes cuál tienes, el tratamiento puede no ser el adecuado. Un test capilar preciso es el primer paso.' },
      { q: '¿Los suplementos anticaída sirven para algo?', a: 'Algunos pueden complementar un tratamiento médico, pero por sí solos no resuelven una alopecia androgenética ni hormonal. Primero el test, después tratamiento.' },
      { q: '¿Necesito trasplante o tratamiento médico?', a: 'Depende de tu tipo de alopecia, tu edad y el grado de pérdida. Nuestros médicos te lo explican con datos reales después del test capilar.' },
      { q: '¿Cuánto cuesta dejar de adivinar?', a: 'El test capilar completo se descuenta íntegro si inicias tratamiento. Compáralo con los €500+ que ya has gastado sin resultado.' },
    ],
    tags: ['nicho-farmacia-sin-salida'],
  },

  // ─── Protocolo Mujer — Nicho genérico femenino (pivote 2026-04-23) ─────
  'protocolo-mujer': {
    slug: 'protocolo-mujer',
    door: 'landing_protocolo_mujer',
    badge: 'Unidad Capilar Femenina · Hospital Capilar',
    headline: 'Tu caída de pelo tiene una causa médica. Vamos a encontrarla.',
    subheadline: 'El Protocolo Mujer de Hospital Capilar cruza tu perfil hormonal con un estudio capilar completo en 30 minutos. No vendemos productos estéticos — diagnosticamos.',
    ctaQuiz: 'Reserva tu Protocolo Mujer',
    ctaForm: 'SOLICITAR VALORACIÓN',
    ecp: 'Protocolo Mujer',
    stats: [
      { value: '40%', label: 'de mujeres sufren caída capilar' },
      { value: '80%', label: 'están mal diagnosticadas' },
      { value: '30 min', label: 'para saber exactamente qué te pasa' },
    ],
    painPoints: [
      '¿Tu médica te dice que "es normal" pero tú ves que no lo es?',
      '¿Has probado champús, suplementos y sueros sin resultado?',
      '¿Sospechas que puede ser hormonal (menopausia, postparto, SOP, tiroides) pero nadie lo evalúa?',
      '¿Sientes que las clínicas capilares son "para hombres" y ninguna te entiende?',
    ],
    testimonials: [
      { name: 'Laura M.', age: 52, text: 'Desde la menopausia se me caía a puñados. Mi médica decía que era normal. En Hospital Capilar cruzaron mi perfil hormonal con tricoscopía y encontraron la causa real.', stars: 5 },
      { name: 'Elena R.', age: 32, text: 'Después del parto se me caía a puñados. 8 meses después seguía igual. En HC descubrieron AGA subyacente. Gracias a actuar a tiempo estoy recuperando densidad.', stars: 5 },
      { name: 'Patricia G.', age: 48, text: 'Llevaba un año con caída brutal. Me dijeron que era por la edad. En HC descubrieron un desbalance hormonal tratable. Por fin alguien me escuchó.', stars: 5 },
    ],
    videoTestimonial: YOLANDA_VIDEO_TESTIMONIAL,
    solution: 'El Protocolo Mujer es tricoscopía digital + analítica hormonal completa + valoración con médica especialista. Todo en el mismo día. Un informe con la causa real y tu plan. Si no necesitas tratamiento, te lo decimos.',
    faqs: [
      { q: '¿En qué se diferencia el Protocolo Mujer de una consulta capilar normal?', a: 'La mayoría de clínicas capilares se centran en hombres. El Protocolo Mujer está diseñado para identificar las causas específicamente femeninas: menopausia, postparto, SOP, tiroides, anemia ferropénica, estrés. Cruzamos tu analítica hormonal con el estudio capilar — nadie más los mira juntos.' },
      { q: '¿Qué incluye exactamente?', a: 'Tricoscopia digital (microscopio capilar de alta resolución), analítica hormonal completa (perfil hormonal + serología + hemograma), valoración con médica especialista en salud capilar femenina, informe personalizado con plan de tratamiento. Todo en el mismo día.' },
      { q: '¿Me van a intentar vender tratamientos estéticos?', a: 'No. Hospital Capilar es un centro médico. Nuestras médicas no cobran comisión por venta de tratamientos. Te dan un informe objetivo con datos y te explican tus opciones. Si no necesitas tratamiento, te lo decimos.' },
      { q: '¿Cuánto cuesta el Protocolo Mujer?', a: '195€ reservando en clínica · 125€ reservando online (oferta limitada). Si inicias tratamiento, se descuenta íntegro del coste del mismo.' },
      { q: '¿Me atenderá una médica mujer?', a: 'Tenemos médicas especialistas en salud capilar femenina en todas las unidades. Puedes solicitarlo al reservar.' },
    ],
    tags: ['nicho-protocolo-mujer'],
  },

  // ─── La Inversión — Post-trasplante sin mantenimiento ─────
  'la-inversion': {
    slug: 'la-inversion',
    door: 'landing_la_inversion',
    badge: 'Mantenimiento Post-Trasplante',
    headline: 'Ya te operaste. ¿Quién protege tu inversión?',
    subheadline: 'Te gastaste €4.000+ en un trasplante y nadie te dijo que necesitabas mantenimiento. El pelo trasplantado no se cae, pero el nativo sigue cayendo.',
    ctaQuiz: 'Protege tu trasplante',
    ctaForm: 'SOLICITAR VALORACIÓN',
    ecp: 'La Inversión',
    stats: [
      { value: '40%', label: 'pierden resultados sin mantenimiento' },
      { value: '12 meses', label: 'críticos post-cirugía' },
      { value: '€4.000+', label: 'invertidos que hay que proteger' },
    ],
    painPoints: [
      '¿Te operaste pero el pelo nativo sigue cayendo?',
      '¿Nadie te habló de mantenimiento después de la cirugía?',
      '¿Tu clínica no te hizo seguimiento post-trasplante?',
      '¿Quieres que los resultados de tu trasplante duren para siempre?',
    ],
    testimonials: [
      { name: 'Fernando G.', age: 39, text: 'Me gasté €4.000 en Turquía y nadie me dijo que necesitaba mantenimiento. En HC me diseñaron un plan y ahora tengo todo controlado.', stars: 5 },
      { name: 'Andrés M.', age: 44, text: 'Me operé en HC y el seguimiento post-operatorio es otro nivel. Tricoscopía cada 6 meses, tratamiento personalizado, y siempre disponibles.', stars: 5 },
    ],
    solution: 'Diseñamos planes de mantenimiento personalizados que protegen tanto el pelo trasplantado como el nativo. Tricoscopía de control + tratamiento médico adaptado a tu caso.',
    faqs: [
      { q: '¿El pelo trasplantado se puede caer?', a: 'El pelo trasplantado es permanente. Pero el pelo nativo (no trasplantado) sigue sometido a la alopecia y necesita protección con tratamiento médico.' },
      { q: '¿Cuándo debo empezar el mantenimiento?', a: 'Lo ideal es empezar desde el primer mes post-cirugía. Pero nunca es tarde — incluso años después podemos diseñar un plan que proteja tus resultados.' },
      { q: '¿Puedo hacer mantenimiento aunque me operé en otra clínica?', a: 'Sí. Evaluamos el estado actual de tu trasplante y del pelo nativo, y diseñamos un plan personalizado independientemente de dónde te operaste.' },
      { q: '¿En qué consiste el seguimiento?', a: 'Tricoscopía de control cada 6 meses, ajuste de tratamiento médico según evolución, y acceso a nuestro equipo para cualquier duda.' },
    ],
    tags: ['nicho-la-inversion'],
  },

  // ─── Quiz Hospital Capilar — Generic landing post-Meta-form ──
  // Used by /quiz-hospitalcapilar/ — receives leads from Meta lead form.
  // Branches by sex inside the quiz: mujer → CRT/HRT + videollamada GHL,
  // hombre → asesoría presencial Koibox.
  'quiz-hospitalcapilar': {
    slug: 'quiz-hospitalcapilar',
    door: 'landing_quiz_hc',
    badge: 'Diagnóstico capilar online',
    headline: 'Descubre qué necesita tu pelo. Sin promesas vacías.',
    subheadline: 'Test capilar online en 5 preguntas. Te decimos qué necesita tu pelo y por qué — con datos, no con humo. Confirmación con un médico de Hospital Capilar.',
    ctaQuiz: 'Quiero recuperar mi pelo',
    ctaForm: 'QUIERO RECUPERAR MI PELO',
    ecp: '¿Qué Me Pasa?',
    stats: [
      { value: '40%', label: 'de mujeres sufren caída capilar' },
      { value: '5', label: 'preguntas para tu pre-diagnóstico' },
      { value: 'Inmediato', label: 'recibes tu resultado al momento' },
    ],
    painPoints: [
      '¿Notas más pelo del que querrías al peinarte o en la ducha?',
      '¿Llevas meses probando productos sin resultado claro?',
      '¿Te dijeron que era hormonal o normal pero nadie te lo confirmó?',
      '¿Quieres saber qué necesita tu pelo realmente?',
    ],
    testimonials: [
      { name: 'Laura M.', age: 52, text: 'Desde la menopausia se me caía a puñados. Mi médica decía que era normal. En Hospital Capilar cruzaron mi perfil hormonal con tricoscopía y encontraron la causa real.', stars: 5 },
      { name: 'Patricia G.', age: 48, text: 'Llevaba un año con caída brutal. Me dijeron que era por la edad. En HC descubrieron un desbalance hormonal tratable. Por fin alguien me escuchó.', stars: 5 },
    ],
    videoTestimonial: YOLANDA_VIDEO_TESTIMONIAL,
    solution: 'Un test capilar online te orienta sobre qué protocolo necesitas. La confirmación se hace con un médico de Hospital Capilar mediante un Examen Analítico Tricometabólico — el único que combina perfil hormonal + tricoscopía + valoración médica.',
    faqs: [
      { q: '¿Qué es el Examen Analítico Tricometabólico?', a: 'Es nuestro test capilar integral: combina analítica de sangre, análisis del propio plasma, tricoscopía digital y valoración médica. Identifica la causa real de tu caída en 30 minutos.' },
      { q: '¿Qué pasa después del quiz online?', a: 'Recibes una pre-recomendación basada en tus respuestas. Para confirmarla, agendas una videollamada gratuita con una asesora que te explica el siguiente paso.' },
      { q: '¿Tiene coste el test online?', a: 'No. El test online y la asesoría posterior por videollamada son completamente gratuitos. Solo se cobra el Examen Analítico Tricometabólico cuando decides hacerlo.' },
      { q: '¿Me van a intentar vender algo?', a: 'No. Nuestros médicos diagnostican y te explican tus opciones. Si no necesitas tratamiento, te lo decimos. Sin presión comercial.' },
    ],
    tags: ['nicho-quiz-hc'],
  },

};
