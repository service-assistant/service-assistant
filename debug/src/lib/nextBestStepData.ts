/**
 * Static, hardcoded reference content describing the Next Best Step
 * algorithm (not DB-driven). Ported from the old jinja template's inline
 * `<script>` block (`actions`, `scenarios`, `flowSteps`, `algorithmSteps`),
 * using error 2:002 as the worked example.
 */

export interface NbsAction {
	id: string
	title: string
	info: number
	resolution: number
	confidence: number
	effort: number
	time: number
	invasive: number
	risk: number
	parts: number
	prerequisites: number
}

/** Same benefit-minus-burden formula as the backend's `calculate_score()`. */
export function computeNbsScore(action: NbsAction): number {
	const benefit = 0.35 * action.info + 0.25 * action.resolution + 0.15 * action.confidence
	const burden =
		0.1 * action.effort +
		0.06 * action.time +
		0.05 * action.invasive +
		0.03 * action.risk +
		0.01 * action.parts +
		0.25 * Math.min(action.prerequisites, 4)
	return Math.round((benefit - burden) * 1000) / 1000
}

export const nbsActions: NbsAction[] = [
	{
		id: 'check_factory',
		title: 'Sprawdź parametry fabryczne',
		info: 8,
		resolution: 5,
		confidence: 9,
		effort: 1,
		time: 1,
		invasive: 0,
		risk: 1,
		parts: 0,
		prerequisites: 0,
	},
	{
		id: 'check_remaining',
		title: 'Sprawdź pozostałe parametry',
		info: 7,
		resolution: 5,
		confidence: 9,
		effort: 2,
		time: 2,
		invasive: 0,
		risk: 1,
		parts: 0,
		prerequisites: 1,
	},
	{
		id: 'correct_parameters',
		title: 'Skoryguj nieprawidłowe parametry',
		info: 5,
		resolution: 9,
		confidence: 8,
		effort: 3,
		time: 3,
		invasive: 1,
		risk: 1,
		parts: 0,
		prerequisites: 1,
	},
	{
		id: 'replace_a5',
		title: 'Wymień moduł A5',
		info: 2,
		resolution: 6,
		confidence: 8,
		effort: 9,
		time: 9,
		invasive: 10,
		risk: 5,
		parts: 9,
		prerequisites: 2,
	},
]

export interface NbsScenario {
	key: string
	label: string
	observation: string
	eligible: string[]
	rejected: string[]
	pendingDecision?: string
	/** Static, hardcoded reference HTML — safe to render directly. */
	messageHtml: string
}

export const nbsScenarios: NbsScenario[] = [
	{
		key: 'initial',
		label: 'Stan początkowy',
		observation: 'Brak wyniku technika',
		eligible: ['check_factory'],
		rejected: [],
		messageHtml:
			'<p>Najpierw sprawdź konfigurację parametrów. Ten krok pozwoli ustalić, czy błąd wynika z ustawień.</p><p>Sprawdź, czy parametry fabryczne są zgodne z konfiguracją wózka.</p>',
	},
	{
		key: 'correct',
		label: 'Fabryczne zgodne',
		observation: 'Parametry fabryczne są zgodne',
		eligible: ['check_remaining'],
		rejected: ['check_factory', 'correct_parameters'],
		messageHtml:
			'<p>Parametry fabryczne są zgodne, dlatego trzeba zawęzić przyczynę.</p><p>Sprawdź, czy pozostałe parametry mieszczą się w dopuszczalnych limitach.</p>',
	},
	{
		key: 'remaining_correct',
		label: 'Pozostałe zgodne',
		observation: 'Wszystkie sprawdzone parametry mieszczą się w limitach',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters'],
		pendingDecision: 'Czy moduł A5 został uznany za uszkodzony?',
		messageHtml:
			'<p>Ustawienia parametrów zostały wykluczone jako przyczyna.</p><p>Przed wymianą trzeba potwierdzić, że moduł A5 jest uszkodzony. Dostarczone fragmenty nie opisują sposobu tego potwierdzenia.</p>',
	},
	{
		key: 'remaining_incorrect',
		label: 'Pozostały parametr poza limitem',
		observation: 'Jeden z pozostałych parametrów jest nieprawidłowy',
		eligible: ['correct_parameters'],
		rejected: ['check_factory', 'check_remaining'],
		messageHtml:
			'<p>Kontrola wykazała parametr poza dopuszczalnym limitem.</p><p>Skoryguj nieprawidłowy parametr zgodnie z konfiguracją wózka.</p><p>Po zmianie podaj, czy błąd nadal występuje.</p>',
	},
	{
		key: 'remaining_correction_resolved',
		label: 'Naprawa zakończona',
		observation: 'Po korekcie pozostałego parametru błąd zniknął',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters', 'replace_a5'],
		messageHtml:
			'<p>Korekta parametru poza limitem usunęła błąd 2:002.</p><p>Diagnostyka zakończona — nie wykonuj kolejnej akcji.</p>',
	},
	{
		key: 'remaining_correction_failed',
		label: 'Błąd pozostał po korekcie',
		observation: 'Wszystkie parametry są poprawne, ale błąd nadal występuje',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters'],
		pendingDecision: 'Czy moduł A5 został uznany za uszkodzony?',
		messageHtml:
			'<p>Po korekcie wszystkie parametry są prawidłowe, ale błąd nadal występuje.</p><p>Przed wymianą trzeba potwierdzić uszkodzenie modułu A5.</p>',
	},
	{
		key: 'a5_confirmed',
		label: 'A5 potwierdzony',
		observation: 'Parametry są zgodne, a moduł A5 został uznany za uszkodzony',
		eligible: ['replace_a5'],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters'],
		messageHtml:
			'<p>Sprawdzenia parametrów nie wykazały nieprawidłowości, a moduł A5 został uznany za uszkodzony.</p><p>Wymień moduł A5 zgodnie z procedurą wymiany.</p><p>Po wymianie sprawdź, czy błąd 2:002 został usunięty.</p>',
	},
	{
		key: 'a5_not_confirmed',
		label: 'A5 niepotwierdzony',
		observation: 'Nie potwierdzono uszkodzenia modułu A5',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters', 'replace_a5'],
		messageHtml:
			'<p>Nie ma potwierdzenia uszkodzenia modułu A5.</p><p>Nie wymieniaj A5. Dostarczona dokumentacja nie wskazuje kolejnej bezpiecznej czynności.</p>',
	},
	{
		key: 'incorrect',
		label: 'Parametry niezgodne',
		observation: 'Co najmniej jeden parametr jest nieprawidłowy',
		eligible: ['correct_parameters'],
		rejected: ['check_factory', 'check_remaining'],
		messageHtml:
			'<p>Wynik potwierdza nieprawidłowe ustawienie parametrów.</p><p>Ustaw nieprawidłowy parametr zgodnie z konfiguracją wózka.</p><p>Po zmianie podaj, czy błąd nadal występuje.</p>',
	},
	{
		key: 'correction_resolved',
		label: 'Naprawa zakończona',
		observation: 'Po korekcie parametrów błąd zniknął',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters', 'replace_a5'],
		messageHtml:
			'<p>Korekta parametrów usunęła błąd 2:002.</p><p>Diagnostyka zakończona — nie wykonuj kolejnej akcji.</p>',
	},
	{
		key: 'correction_failed',
		label: 'Błąd pozostał po korekcie',
		observation: 'Parametry skorygowano, ale błąd nadal występuje',
		eligible: ['check_remaining'],
		rejected: ['check_factory', 'correct_parameters'],
		messageHtml:
			'<p>Korekta nie usunęła błędu, dlatego trzeba kontynuować zawężanie przyczyny.</p><p>Sprawdź pozostałe parametry i ich dopuszczalne limity.</p>',
	},
	{
		key: 'a5_resolved',
		label: 'Naprawa A5 zakończona',
		observation: 'Po wymianie A5 błąd zniknął',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters', 'replace_a5'],
		messageHtml:
			'<p>Po wymianie modułu A5 błąd 2:002 nie występuje.</p><p>Diagnostyka zakończona.</p>',
	},
	{
		key: 'a5_failed',
		label: 'Błąd pozostał po wymianie',
		observation: 'Wymiana A5 nie usunęła błędu',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters', 'replace_a5'],
		messageHtml:
			'<p>Wymiana A5 nie usunęła błędu 2:002.</p><p>Dostarczona dokumentacja nie wskazuje dalszej akcji. Przekaż przypadek do eskalacji serwisowej.</p>',
	},
	{
		key: 'unreadable',
		label: 'Brak odczytu',
		observation: 'Technik nie może odczytać parametrów',
		eligible: [],
		rejected: ['check_factory', 'check_remaining', 'correct_parameters', 'replace_a5'],
		messageHtml:
			'<p>Nie udało się potwierdzić stanu parametrów.</p><p>Dostarczona dokumentacja nie uzasadnia następnej czynności dla tego wyniku.</p>',
	},
]

export interface NbsFlowChoice {
	label: string
	scenario: string
	next: string
}

export interface NbsFlowStep {
	key: string
	badge: string
	title: string
	action?: string
	question?: string
	choices?: NbsFlowChoice[]
	terminal?: string
}

export const nbsFlowSteps: NbsFlowStep[] = [
	{
		key: 'initial',
		badge: 'ZGŁOSZENIE',
		title: 'Błąd 2:002',
		action: 'Sprawdź, czy parametry fabryczne są zgodne z konfiguracją wózka.',
		question: 'Jaki jest wynik sprawdzenia?',
		choices: [
			{ label: 'Parametry są niezgodne', scenario: 'incorrect', next: 'correct_factory' },
			{ label: 'Parametry są zgodne', scenario: 'correct', next: 'check_remaining' },
			{ label: 'Nie można ich odczytać', scenario: 'unreadable', next: 'unreadable_end' },
		],
	},
	{
		key: 'correct_factory',
		badge: 'KOLEJNA AKCJA',
		title: 'Skoryguj parametry',
		action: 'Ustaw nieprawidłowe parametry zgodnie z konfiguracją wózka.',
		question: 'Czy po korekcie błąd 2:002 zniknął?',
		choices: [
			{ label: 'Tak, błąd zniknął', scenario: 'correction_resolved', next: 'resolved_end' },
			{ label: 'Nie, błąd pozostał', scenario: 'correction_failed', next: 'check_remaining' },
		],
	},
	{
		key: 'check_remaining',
		badge: 'KOLEJNA AKCJA',
		title: 'Sprawdź pozostałe parametry',
		action: 'Sprawdź, czy pozostałe wartości mieszczą się w dopuszczalnych limitach.',
		question: 'Jaki jest wynik kontroli?',
		choices: [
			{
				label: 'Jeden parametr jest poza limitem',
				scenario: 'remaining_incorrect',
				next: 'correct_remaining',
			},
			{
				label: 'Wszystkie parametry są prawidłowe',
				scenario: 'remaining_correct',
				next: 'confirm_a5',
			},
		],
	},
	{
		key: 'correct_remaining',
		badge: 'KOLEJNA AKCJA',
		title: 'Skoryguj parametr poza limitem',
		action: 'Ustaw parametr zgodnie z konfiguracją wózka.',
		question: 'Czy po korekcie błąd 2:002 zniknął?',
		choices: [
			{
				label: 'Tak, błąd zniknął',
				scenario: 'remaining_correction_resolved',
				next: 'resolved_end',
			},
			{
				label: 'Nie, błąd pozostał',
				scenario: 'remaining_correction_failed',
				next: 'confirm_a5',
			},
		],
	},
	{
		key: 'confirm_a5',
		badge: 'BRAMKA DECYZYJNA',
		title: 'Potwierdzenie usterki A5',
		action: 'Nie wymieniaj modułu tylko na podstawie prawidłowych parametrów.',
		question: 'Czy moduł A5 został uznany za uszkodzony?',
		choices: [
			{
				label: 'Nie potwierdzono uszkodzenia',
				scenario: 'a5_not_confirmed',
				next: 'a5_unconfirmed_end',
			},
			{ label: 'Tak, A5 jest uszkodzony', scenario: 'a5_confirmed', next: 'replace_a5' },
		],
	},
	{
		key: 'replace_a5',
		badge: 'KOLEJNA AKCJA',
		title: 'Wymień moduł A5',
		action: 'Wymień moduł A5 zgodnie z procedurą wymiany.',
		question: 'Czy po wymianie błąd 2:002 zniknął?',
		choices: [
			{ label: 'Tak, błąd zniknął', scenario: 'a5_resolved', next: 'resolved_end' },
			{ label: 'Nie, błąd pozostał', scenario: 'a5_failed', next: 'escalation_end' },
		],
	},
	{
		key: 'unreadable_end',
		badge: 'ZATRZYMANIE',
		title: 'Brak odczytu parametrów',
		terminal: 'Dostarczone fragmenty dokumentacji nie wskazują następnej bezpiecznej akcji.',
	},
	{
		key: 'a5_unconfirmed_end',
		badge: 'ZATRZYMANIE',
		title: 'A5 niepotwierdzony',
		terminal: 'Nie wymieniaj modułu A5. Dokumentacja nie uzasadnia dalszej czynności.',
	},
	{
		key: 'resolved_end',
		badge: 'KONIEC',
		title: 'Błąd usunięty',
		terminal: 'Diagnostyka zakończona. Nie wykonuj kolejnej akcji.',
	},
	{
		key: 'escalation_end',
		badge: 'ESKALACJA',
		title: 'Błąd nadal występuje',
		terminal: 'Dokumentacja nie zawiera dalszej akcji dla tego scenariusza.',
	},
]

export interface NbsAlgorithmStep {
	owner: string
	mode: 'code' | 'llm' | 'hybrid'
	modeLabel: string
	boundary: string
	title: string
	rule: string
	inputLabel: string
	input: string
	outputLabel: string
	output: string
}

export const nbsAlgorithmSteps: NbsAlgorithmStep[] = [
	{
		owner: 'BACKEND · retrieval.py',
		mode: 'code',
		modeLabel: 'NIE LLM · INFRASTRUKTURA',
		boundary:
			'LLM nie pobiera wiarygodnie danych z bazy ani nie gwarantuje zachowania identyfikatorów źródeł. Ten etap musi wykonać backend.',
		title: '1. Odebranie chunków dla urządzenia',
		rule: 'Silnik dostaje już wyniki wyszukiwania hybrydowego. Każdy fragment zachowuje identyfikator i źródło.',
		inputLabel: 'WEJŚCIE: pytanie + urządzenie',
		input: `{
  "question": "Mam błąd 2:002",
  "device_id": 17
}`,
		outputLabel: 'WYJŚCIE: 6 surowych RetrievedChunk',
		output: `[
  {
    "id": 411,
    "attachment_id": 9,
    "content": "|2:002|Parametry ustawione|1: Wczytano nowe|1: · Sprawdź parametry|",
    "extra_metadata": {"page": 42}
  },
  {
    "id": 412,
    "attachment_id": 9,
    "content": "|2:002|na wartości domyślne. Podczas rozruchu wykryto przynajmniej|||oprogramowanie wózka, dodając nowy parametr lub zmieniono wartość|· Sprawdź, czy parametry fabryczne są ustawione zgodnie z konfiguracją wózka.||",
    "extra_metadata": {"page": 42}
  },
  {
    "id": 413,
    "attachment_id": 9,
    "content": "|2:002|jeden parametr nie|Brak wpływu.||limitów parametrów.|· Sprawdź, czy pozostałe parametry są||",
    "extra_metadata": {"page": 42}
  },
  {
    "id": 414,
    "attachment_id": 9,
    "content": "|2:002|mieszczący się w|2: Uszkodzona pamięć A5|ustawione prawidłowo.||",
    "extra_metadata": {"page": 42}
  },
  {
    "id": 415,
    "attachment_id": 9,
    "content": "|2:002|dopuszczalnym zakresie||||2: Wymień A5.|",
    "extra_metadata": {"page": 42}
  },
  {
    "id": 416,
    "attachment_id": 9,
    "content": "|2:002|wartości, zostały one wyzerowane do wartości domyślnych.||||Patrz rozdział „13.1.3 Wymiana karty logicznej”.|",
    "extra_metadata": {"page": 42}
  }
]`,
	},
	{
		owner: 'BACKEND · next_best_step.py',
		mode: 'code',
		modeLabel: 'NIE LLM · KOD',
		boundary:
			'LLM nie może pilnować twardego limitu i mapowania źródeł. Numery fragmentów oraz limit kontekstu muszą być nadane deterministycznie.',
		title: '2. Numerowanie i ograniczenie kontekstu',
		rule: 'Puste fragmenty są pomijane, a tekst jest ograniczany do 12 000 znaków. Numery fragmentów później stają się referencjami źródłowymi.',
		inputLabel: 'WEJŚCIE: content z chunków',
		input: `[chunk["content"] for chunk in retrieved_chunks]`,
		outputLabel: 'WYJŚCIE: kontekst dla ekstraktora',
		output: `[Fragment 1]
|2:002|Parametry ustawione|1: Wczytano nowe|1: · Sprawdź parametry|

[Fragment 2]
|2:002|na wartości domyślne. Podczas rozruchu wykryto przynajmniej|||oprogramowanie wózka, dodając nowy parametr lub zmieniono wartość|· Sprawdź, czy parametry fabryczne są ustawione zgodnie z konfiguracją wózka.||

[Fragment 3]
|2:002|jeden parametr nie|Brak wpływu.||limitów parametrów.|· Sprawdź, czy pozostałe parametry są||

[Fragment 4]
|2:002|mieszczący się w|2: Uszkodzona pamięć A5|ustawione prawidłowo.||

[Fragment 5]
|2:002|dopuszczalnym zakresie||||2: Wymień A5.|

[Fragment 6]
|2:002|wartości, zostały one wyzerowane do wartości domyślnych.||||Patrz rozdział „13.1.3 Wymiana karty logicznej”.|`,
	},
	{
		owner: 'LLM · Structured Output',
		mode: 'llm',
		modeLabel: 'LLM',
		boundary:
			'To jest właściwe zadanie dla LLM: zrozumienie rozbitej tabeli i zaproponowanie ustrukturyzowanych akcji. Wynik nadal wymaga kontroli kodu.',
		title: '3. Ekstrakcja akcji i metadanych',
		rule: 'LLM nie odpowiada technikowi. Wypełnia ścisły schemat JSON i ocenia każdą metrykę w skali 0–10.',
		inputLabel: 'WEJŚCIE: kontekst + JSON Schema',
		input: `DiagnosticActions {
  error_code: string,
  actions: DiagnosticAction[]
}

temperature = 0`,
		outputLabel: 'WYJŚCIE: surowy Structured Output',
		output: `{
  "error_code": "2:002",
  "actions": [
    {
      "id": "check_factory",
      "title": "Sprawdź parametry fabryczne",
      "instruction": "Sprawdź ustawienia zgodnie z konfiguracją wózka",
      "source_fragment_numbers": [1],
      "metadata": {
        "information_gain": 8,
        "resolution_probability": 5,
        "evidence_confidence": 9,
        "effort_cost": 1,
        "time_cost": 1,
        "invasiveness": 0,
        "safety_risk": 1,
        "parts_cost": 0,
        "estimated_minutes": 5,
        "required_tools": [],
        "prerequisites": []
      },
      "score": null
    }
  ]
}`,
	},
	{
		owner: 'PYDANTIC · walidacja deterministyczna',
		mode: 'code',
		modeLabel: 'NIE LLM · KOD',
		boundary:
			'LLM nie może sam zatwierdzić własnej odpowiedzi. Typy, wymagane pola, zakresy i dozwolony kod błędu musi sprawdzić niezależny kod.',
		title: '4. Odrzucenie niepoprawnych danych LLM',
		rule: 'Backend wymaga wszystkich pól, blokuje pola dodatkowe, zakresy poza 0–10 i kod inny niż 2:002.',
		inputLabel: 'WEJŚCIE: JSON z LLM',
		input: `DiagnosticActions.model_validate(json)

error_code.replace(".", ":") == "2:002"`,
		outputLabel: 'WYJŚCIE: typowane obiekty',
		output: `DiagnosticAction(
  id="check_factory",
  metadata=ActionMetadata(
    information_gain=8.0,
    effort_cost=1.0,
    ...
  ),
  score=None
)`,
	},
	{
		owner: 'BACKEND · calculate_score()',
		mode: 'code',
		modeLabel: 'NIE LLM · WZÓR',
		boundary:
			'LLM nie powinien wyliczać ani ustalać score. Ten sam jawny wzór musi zostać wykonany przez kod dla każdej akcji.',
		title: '5. Obliczenie użyteczności każdej akcji',
		rule: 'LLM dostarcza metadane, ale nigdy nie ustala score. Wynik liczy kod tym samym wzorem dla każdego kandydata.',
		inputLabel: 'WEJŚCIE: ActionMetadata',
		input: `information_gain = 8
resolution_probability = 5
evidence_confidence = 9
effort_cost = 1
time_cost = 1
invasiveness = 0
safety_risk = 1
parts_cost = 0
prerequisites = []`,
		outputLabel: 'WYJŚCIE: benefit − burden',
		output: `benefit =
  0.35×8 + 0.25×5 + 0.15×9
  = 5.40

burden =
  0.10×1 + 0.06×1 + 0.03×1
  = 0.19

score = 5.40 − 0.19 = 5.210`,
	},
	{
		owner: 'BACKEND · rank_actions()',
		mode: 'code',
		modeLabel: 'NIE LLM · KOD',
		boundary:
			'LLM nie gwarantuje stabilnego sortowania i tie-breaku. Kolejność kandydatów musi wynikać dokładnie ze score oraz ustalonych reguł.',
		title: '6. Sortowanie i tie-break',
		rule: 'Najpierw malejący score. Przy remisie wygrywa mniejsza inwazyjność, a potem mniejszy wysiłek.',
		inputLabel: 'WEJŚCIE: akcje ze score',
		input: `check_factory       5.210
check_remaining     4.450
correct_parameters  4.390
replace_a5          0.720`,
		outputLabel: 'WYJŚCIE: ukryty ranking kandydatów',
		output: `1. check_factory
2. check_remaining
3. correct_parameters
4. replace_a5

Technik zobaczy tylko pozycję 1.`,
	},
	{
		owner: 'LLM · FollowupDecision',
		mode: 'llm',
		modeLabel: 'LLM',
		boundary:
			'LLM interpretuje swobodną wypowiedź technika. Nie wymaga konkretnej wartości, jednostki ani formatu odpowiedzi.',
		title: '7. Interpretacja wyniku technika',
		rule: 'Po odpowiedzi technika LLM wyłącznie rozpoznaje, czy wiadomość dotyczy bieżącej czynności oraz czy problem został rozwiązany.',
		inputLabel: 'WEJŚCIE: poprzednia akcja + odpowiedź',
		input: `assistant: "Sprawdź parametry fabryczne"
technician: "Są dobre"`,
		outputLabel: 'WYJŚCIE: FollowupDecision',
		output: `{
  "is_action_result": true,
  "observation_summary": "Parametry fabryczne są zgodne",
  "diagnostic_complete": false
}`,
	},
	{
		owner: 'BACKEND + LLM odpowiedzi',
		mode: 'hybrid',
		modeLabel: 'HYBRYDA · KOD + LLM',
		boundary:
			'Przejście do kolejnej zapisanej akcji wykonuje kod. LLM może jedynie ubrać wybraną akcję w naturalny komunikat.',
		title: '8. Filtrowanie, reranking i prezentacja',
		rule: 'Backend usuwa bieżącą akcję i przekazuje generatorowi następną akcję z kolejki. UI dostaje jedną czynność.',
		inputLabel: 'WEJŚCIE: ranking + decyzja',
		input: `remaining = actions after current_action

next_action = remaining[0]`,
		outputLabel: 'WYJŚCIE: wiadomość dla technika',
		output: `Parametry fabryczne są zgodne, dlatego trzeba zawęzić przyczynę.

Sprawdź, czy pozostałe parametry mieszczą się w dopuszczalnych limitach.`,
	},
]
