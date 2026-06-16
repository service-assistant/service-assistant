# Presentation

## Used Technologies

### 📱 Client
| Kategoria | Technologia |
|-----------|-------------|
| Język | TypeScript |
| Framework | React Native + Expo |

### 🖥️ Server
| Kategoria | Technologia |
|-----------|-------------|
| Język | Python |
| Framework | FastAPI |
| Baza danych | PostgreSQL + pgvector |

### ☁️ Infrastruktura
| Kategoria | Technologia |
|-----------|-------------|
| Hosting | VPS (Docker + Docker Compose) |
| Embeddingi | Azure OpenAI |
| Chat LLM | OpenAI |
| STT | Deepgram |
| TTS | Google Gemini |


## System Overview

```mermaid
graph LR
    App["📱 Client App\n(React Native)"]

    subgraph VPS["🖥️ VPS"]
        Caddy["🔒 Caddy\n(reverse proxy)"]

        STAGING["Asystent Serwisanta Staging"]

        subgraph PROD["🐳 Asystent Serwisanta Production (Docker)"]
            subgraph FASTAPI["FastAPI"]
                RAG["RAG Pipeline"]
                STT["Transcription"]
            end
            PG[("PostgreSQL\n+ pgvector")]
        end

    end

    AZ["Azure OpenAI\n(embeddings)"]
    OAI["OpenAI\n(chat)"]
    GEM["Gemini\n(TTS)"]
    DG["Deepgram\n(STT)"]

    App -- "HTTPS / WSS" --> Caddy
    Caddy --> RAG
    Caddy --> STT
    Caddy -.-> STAGING

    RAG --> PG
    RAG --> AZ
    RAG --> OAI
    RAG --> GEM

    STT --> DG
```

## Database Schema

```mermaid
erDiagram
    brands {
        int id PK
        string name
        string logo_url "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    device_types {
        int id PK
        string name
        timestamptz created_at
        timestamptz updated_at
    }

    devices {
        int id PK
        string name
        string model_serial_code "nullable"
        string image_url "nullable"
        int brand_id FK
        int device_type_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    attachments {
        int id PK
        string file_global_path
        string original_filename
        timestamptz created_at
        timestamptz updated_at
    }

    attachments_devices {
        int device_id FK,PK
        int attachment_id FK,PK
    }

    chunks {
        int id PK
        string content
        vector_1536 embedding "pgvector"
        jsonb metadata "nullable: {page, images}"
        int attachment_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    chat_threads {
        int id PK
        string title
        int device_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    messages {
        int id PK
        string content
        enum sender "user | assistant"
        int thread_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    chunks_messages {
        int message_id FK,PK
        int chunk_id FK,PK
    }

    brands ||--o{ devices : "has"
    device_types ||--o{ devices : "has"
    devices ||--o{ chat_threads : "has"
    devices }o--o{ attachments : "attachments_devices"
    attachments ||--o{ chunks : "contains"
    chat_threads ||--o{ messages : "contains"
    messages }o--o{ chunks : "chunks_messages"
```

## RAG pipeline (message flow)

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant API as FastAPI
    participant AZ as Azure OpenAI<br/>(embeddings)
    participant PG as PostgreSQL<br/>pgvector
    participant OAI as OpenAI<br/>(chat)
    participant GEM as Gemini<br/>(TTS)

    App->>API: POST /threads/{id}/messages {content}
    API->>AZ: embed(question)
    AZ-->>API: vector[1536]
    API->>PG: semantic search (cosine <->)\n+ BM25 in-memory
    PG-->>API: top chunks (7 semantic + 3 BM25)
    API->>OAI: stream_chat(system_prompt + history + chunks + question)
    loop SSE stream
        OAI-->>API: delta token
        API-->>App: event: chunk
        API->>GEM: synthesize_pcm(sentence) [async]
        GEM-->>API: PCM bytes
        API-->>App: event: audio_chunk / audio_done
    end
    API->>PG: INSERT Message + ChunkMessage
    API-->>App: event: message (final JSON)
```

## Voice transcription flow

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant API as FastAPI
    participant DG as Deepgram

    alt File upload (one-shot)
        App->>API: POST /threads/{id}/messages/transcribe (audio file)
        API->>DG: POST /v1/listen (audio bytes)
        DG-->>API: transcript JSON
        API-->>App: {transcript}
    else Real-time streaming
        App->>API: WS /threads/{id}/messages/transcribe-stream
        loop audio frames
            App->>API: binary audio chunk
            API->>DG: forward via WSS
            DG-->>API: {type:Results, transcript, is_final}
            API-->>App: {type: partial|final, transcript}
        end
    end
```

