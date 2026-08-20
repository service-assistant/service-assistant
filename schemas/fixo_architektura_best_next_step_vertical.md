# Fixo — architektura Best Next Step (układ pionowy)

```mermaid
flowchart TD

    %% =========================
    %% 1. INGESTION
    %% =========================
    subgraph INGEST["1. Ingestion dokumentów"]
        A1["PDF / manual / instrukcja"]
        A2["Parser dokumentu / OCR<br/>tekst + tabele + nagłówki + strony"]
        A3["Structure-aware Chunker<br/>sekcje + parent-child"]
        A4["Chunk Enrichment / LLM<br/>symptomy, komponenty,<br/>akcje, kody błędów, synonimy"]
        A5["Embedding Service"]
        A6["Vector DB<br/>content_embedding<br/>symptom_embedding"]
        A7["BM25 / Full-text Index"]
        A8["Metadata Store<br/>model maszyny, dokument,<br/>sekcja, strona, wersja"]

        A1 --> A2 --> A3 --> A4 --> A5 --> A6
        A3 --> A7
        A3 --> A8
        A4 --> A8
    end

    %% =========================
    %% 2. QUERY
    %% =========================
    subgraph QUERY["2. Rozumienie zgłoszenia"]
        B1["Technik<br/>„widły się nie podnoszą”"]
        B2["Machine Context Resolver<br/>marka / model / numer seryjny"]
        B3["Query Rewriter / LLM"]
        B4["Expanded Queries<br/>forks do not lift<br/>lift function not operating<br/>mast does not raise"]

        B1 --> B2 --> B3 --> B4
    end

    %% =========================
    %% 3. RETRIEVAL
    %% =========================
    subgraph RET["3. Retrieval"]
        C1["Vector Search<br/>content"]
        C2["Vector Search<br/>symptoms"]
        C3["BM25"]
        C4["Metadata Filters<br/>model / wersja / typ dokumentu"]
        C5["RRF / Fusion"]
        C6["Reranker"]
        C7["Parent Section Fetcher<br/>pobranie pełnej procedury"]

        C1 --> C5
        C2 --> C5
        C3 --> C5
        C4 --> C5
        C5 --> C6 --> C7
    end

    %% =========================
    %% 4. EVIDENCE / REASONING
    %% =========================
    subgraph REASON["4. Evidence + diagnostyka"]
        D1["Evidence Quality Gate<br/>czy fragmenty naprawdę<br/>dotyczą objawu?"]
        D2["Diagnostic Extractor / LLM<br/>warunki, testy, wyniki,<br/>przejścia"]
        D3["Task State Store<br/>KNOWN / UNKNOWN / CONFLICTING"]
        D4["Gap Detector<br/>czego trzeba się dowiedzieć?"]
        D5["Candidate Action Generator<br/>jak zdobyć brakującą informację?"]
        D6["Best Next Step Scorer<br/>wartość diagnostyczna<br/>vs koszt / czas / ryzyko"]
        D7["Loop Controller"]

        D1 --> D2 --> D3 --> D4 --> D5 --> D6 --> D7
    end

    %% =========================
    %% 5. EXECUTION LOOP
    %% =========================
    subgraph EXEC["5. Wykonanie następnego kroku"]
        E1{"Typ następnej akcji"}
        E2["SEARCH AGAIN<br/>zmień lub poszerz query"]
        E3["ASK TECHNICIAN<br/>wykonaj test / podaj wynik"]
        E4["READ / COMPARE<br/>sprawdź kolejny fragment"]
        E5["STOP<br/>evidence wystarcza"]

        E1 --> E2
        E1 --> E3
        E1 --> E4
        E1 --> E5
    end

    %% =========================
    %% 6. OUTPUT
    %% =========================
    subgraph OUT["6. Odpowiedź"]
        F1["Answer Generator<br/>następny krok + uzasadnienie"]
        F2["Citations / Source Resolver<br/>manual + sekcja + strona"]
        F3["UI Fixo"]

        F1 --> F3
        F2 --> F3
    end

    %% =========================
    %% 7. OBSERVABILITY
    %% =========================
    subgraph OBS["7. Jakość i uczenie"]
        G1["Logs / Traces"]
        G2["Feedback technika<br/>czy krok pomógł?"]
        G3["Evaluation Dataset"]
        G4["Metryki<br/>Recall@K, reranker quality,<br/>first-step success, MTTR"]

        G1 --> G3
        G2 --> G3
        G3 --> G4
    end

    %% =========================
    %% GŁÓWNY PRZEPŁYW
    %% =========================
    INGEST --> QUERY
    QUERY --> RET
    RET --> REASON
    REASON --> EXEC
    EXEC --> OUT
    OUT --> OBS

    %% =========================
    %% POŁĄCZENIA SYSTEMOWE
    %% =========================
    A6 --> C1
    A6 --> C2
    A7 --> C3
    A8 --> C4

    B4 --> C1
    B4 --> C2
    B4 --> C3
    B2 --> C4

    C7 --> D1

    D7 --> E1

    E2 --> B3
    E3 --> D3
    E4 --> C7

    D6 --> F1
    C7 --> F2
    E5 --> F1

    F3 --> G1
    F3 --> G2

    D1 -- "słabe evidence" --> B3
```
