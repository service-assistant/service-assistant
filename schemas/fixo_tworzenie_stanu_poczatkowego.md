# Fixo — miejsce tworzenia stanu początkowego

```mermaid
flowchart TD

    A["Technik zgłasza problem<br/>np. „widły się nie podnoszą”"]

    B["Case Context — stan wejściowy<br/>Tworzony od razu z danych użytkownika<br/><br/>symptom = forks_not_lifting<br/>machine = 8FGF25<br/>observations = {}"]

    C["Query Rewrite / Expansion"]

    D["Retrieval + Reranker"]

    E["Evidence Quality Gate<br/>Relevance, Diagnostic usefulness,<br/>Specificity, Authority, Consistency,<br/>Coverage, Applicability"]

    F{"Evidence Score<br/>≥ próg?"}

    G["Poszerz / zmień query<br/>i wykonaj retrieval ponownie"]

    H["Accepted Evidence"]

    I["Diagnostic Extractor / LLM<br/>Wyciąga z evidence:<br/>• testy<br/>• warunki<br/>• możliwe wyniki<br/>• zależności diagnostyczne"]

    J["Diagnostic State — pierwszy stan diagnostyczny<br/>Tworzony dopiero tutaj<br/><br/>symptom = forks_not_lifting<br/>pump_operating = UNKNOWN"]

    K["Gap Detector<br/>Wybiera aktualnie istotny UNKNOWN"]

    L["Best Next Step<br/>np. sprawdź, czy pompa pracuje"]

    M["Wynik od technika<br/>np. pump_operating = true"]

    N["Update Diagnostic State<br/>pump_operating = KNOWN<br/>hydraulic_pressure = UNKNOWN"]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F

    F -- "Nie" --> G
    G --> C

    F -- "Tak" --> H
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
    M --> N
    N --> K
```

## Rozróżnienie stanów

- **Case Context** powstaje przed retrievalem i zawiera tylko fakty już znane z wejścia użytkownika oraz kontekstu maszyny.
- **Diagnostic State** powstaje dopiero po przejściu Evidence Quality Gate i ekstrakcji logiki diagnostycznej z zaakceptowanych źródeł.
