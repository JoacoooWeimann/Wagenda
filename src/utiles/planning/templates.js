// Textos por tipo de objetivo. El algoritmo no conoce los tipos: solo usa estas
// tablas. Agregar un tipo nuevo = agregar entradas acá (y al enum GoalType).

export const TYPE_LABELS = {
  academico: 'Académico',
  fisico: 'Físico',
  videojuego: 'Videojuego',
  profesional: 'Profesional'
};

// Estrategia sugerida en el formulario; el usuario puede cambiarla
export const DEFAULT_STRATEGY = {
  academico: 'divisible',
  profesional: 'divisible',
  fisico: 'fases',
  videojuego: 'fases'
};

// Siempre 4 fases con la misma forma: apertura, construcción, exigencia, cierre.
// Apertura y cierre duran 1 semana; las dos del medio se reparten el resto.
export const PHASE_TEMPLATES = {
  fisico: [
    { name: 'Diagnóstico', description: 'Medí tu punto de partida y registralo para comparar al final.' },
    { name: 'Consistencia', description: 'Construí el hábito con carga moderada: lo importante es no saltear sesiones.' },
    { name: 'Intensidad', description: 'Aumentá la carga de a poco: más tiempo, distancia o peso que la semana anterior.' },
    { name: 'Evaluación', description: 'Repetí la medición del diagnóstico y compará con tu punto de partida.' }
  ],
  videojuego: [
    { name: 'Exploración', description: 'Conocé las mecánicas y detectá dónde fallás más.' },
    { name: 'Práctica', description: 'Repetí lo básico hasta que salga sin pensarlo.' },
    { name: 'Dominio', description: 'Enfrentá desafíos más difíciles que tu nivel actual.' },
    { name: 'Desafío final', description: 'Intentá el objetivo y anotá qué salió bien y qué no.' }
  ],
  academico: [
    { name: 'Diagnóstico', description: 'Evaluá qué sabés y qué no del tema.' },
    { name: 'Fundamentos', description: 'Estudiá los conceptos base.' },
    { name: 'Práctica', description: 'Resolvé ejercicios y aplicá lo aprendido.' },
    { name: 'Evaluación', description: 'Hacé una prueba de nivel y repasá los puntos débiles.' }
  ],
  profesional: [
    { name: 'Planificación', description: 'Definí entregables, recursos y criterios de éxito.' },
    { name: 'Ejecución', description: 'Avanzá en las tareas principales.' },
    { name: 'Profundización', description: 'Mejorá la calidad y resolvé lo pendiente.' },
    { name: 'Revisión', description: 'Revisá los resultados contra los criterios definidos.' }
  ]
};
