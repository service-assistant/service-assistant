from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_FILE = OUTPUT_DIR / "dokumentacja_projektu_service_assistant.pdf"


class SectionBar(Flowable):
    def __init__(self, title: str, subtitle: str | None = None):
        super().__init__()
        self.title = title
        self.subtitle = subtitle
        self.width = 0
        self.height = 2.55 * cm

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        canvas = self.canv
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#17324D"))
        canvas.roundRect(0, 0, self.width, self.height, 8, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("DejaVuSans-Bold", 16)
        canvas.drawString(0.55 * cm, 1.48 * cm, self.title)
        if self.subtitle:
            canvas.setFont("DejaVuSans", 8.5)
            canvas.setFillColor(colors.HexColor("#DCE9F5"))
            canvas.drawString(0.55 * cm, 0.72 * cm, self.subtitle)
        canvas.restoreState()


def register_fonts() -> None:
    fonts_dir = Path("C:/Windows/Fonts")
    pdfmetrics.registerFont(TTFont("DejaVuSans", str(fonts_dir / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(fonts_dir / "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Oblique", str(fonts_dir / "DejaVuSans-Oblique.ttf")))


def styles():
    base = getSampleStyleSheet()
    base.add(
        ParagraphStyle(
            name="DocTitle",
            fontName="DejaVuSans-Bold",
            fontSize=24,
            leading=30,
            textColor=colors.HexColor("#17324D"),
            alignment=TA_CENTER,
            spaceAfter=12,
        )
    )
    base.add(
        ParagraphStyle(
            name="DocSubtitle",
            fontName="DejaVuSans",
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#4B5563"),
            alignment=TA_CENTER,
            spaceAfter=22,
        )
    )
    base.add(
        ParagraphStyle(
            name="H1Custom",
            fontName="DejaVuSans-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#17324D"),
            spaceBefore=14,
            spaceAfter=7,
        )
    )
    base.add(
        ParagraphStyle(
            name="H2Custom",
            fontName="DejaVuSans-Bold",
            fontSize=11.2,
            leading=15,
            textColor=colors.HexColor("#1F2937"),
            spaceBefore=8,
            spaceAfter=5,
        )
    )
    base.add(
        ParagraphStyle(
            name="BodyCustom",
            fontName="DejaVuSans",
            fontSize=9.3,
            leading=13.4,
            textColor=colors.HexColor("#202938"),
            spaceAfter=5,
        )
    )
    base.add(
        ParagraphStyle(
            name="TableHeader",
            fontName="DejaVuSans-Bold",
            fontSize=8.7,
            leading=12,
            textColor=colors.white,
        )
    )
    base.add(
        ParagraphStyle(
            name="Small",
            fontName="DejaVuSans",
            fontSize=7.4,
            leading=10,
            textColor=colors.HexColor("#4B5563"),
        )
    )
    base.add(
        ParagraphStyle(
            name="CodeBlock",
            fontName="Courier",
            fontSize=7.6,
            leading=10.5,
            textColor=colors.HexColor("#111827"),
            backColor=colors.HexColor("#EEF2F7"),
            borderPadding=5,
            leftIndent=0,
            spaceBefore=3,
            spaceAfter=7,
        )
    )
    base.add(
        ParagraphStyle(
            name="Footer",
            fontName="DejaVuSans",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#6B7280"),
            alignment=TA_RIGHT,
        )
    )
    return base


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def bullets(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, style), bulletColor=colors.HexColor("#2C7A7B")) for item in items],
        bulletType="bullet",
        leftIndent=15,
        bulletFontName="DejaVuSans",
        bulletFontSize=6,
        spaceBefore=1,
        spaceAfter=5,
    )


def table(data: list[list[str]], widths: list[float], style: ParagraphStyle) -> Table:
    header_style = styles()["TableHeader"]
    prepared = [
        [p(cell, header_style if row_index == 0 else style) for cell in row]
        for row_index, row in enumerate(data)
    ]
    t = Table(prepared, colWidths=widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324D")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F8FAFC")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8DEE9")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("DejaVuSans", 7)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(2 * cm, 1.15 * cm, "Fixo - dokumentacja projektowa")
    canvas.drawRightString(A4[0] - 2 * cm, 1.15 * cm, f"Strona {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#D8DEE9"))
    canvas.line(2 * cm, 1.45 * cm, A4[0] - 2 * cm, 1.45 * cm)
    canvas.restoreState()


def build_story():
    s = styles()
    story = []

    story.append(Spacer(1, 2.2 * cm))
    story.append(p("Dokumentacja projektu", s["DocTitle"]))
    story.append(
        p(
            "Fixo / Asystent Serwisanta<br/>"
            "Dokumentacja użytkowa i techniczna aplikacji mobilnej oraz backendu",
            s["DocSubtitle"],
        )
    )
    story.append(
        table(
            [
                ["Element", "Opis"],
                ["Typ dokumentu", "Dokumentacja łączona: użytkowa, techniczna oraz uruchomieniowa"],
                ["Repozytorium", "Monorepo: client/ - React Native/Expo, server/ - FastAPI"],
                ["Wersja opracowania", "1.0"],
                ["Data", "18 czerwca 2026"],
            ],
            [4.0 * cm, 11.3 * cm],
            s["BodyCustom"],
        )
    )
    story.append(Spacer(1, 0.7 * cm))
    story.append(
        p(
            "Celem dokumentu jest opisanie systemu z perspektywy użytkownika końcowego oraz osoby "
            "technicznej, która ma uruchomić, rozwijać lub testować projekt.",
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Spis treści", "Zakres dokumentacji"))
    story.append(Spacer(1, 0.35 * cm))
    story.append(
        bullets(
            [
                "Cel projektu i zakres systemu",
                "Opis funkcjonalności aplikacji",
                "Instrukcja obsługi dla użytkownika",
                "Architektura systemu",
                "Frontend - React Native / Expo",
                "Backend - FastAPI",
                "API i komunikacja klient-serwer",
                "Baza danych i przetwarzanie dokumentów",
                "Konfiguracja, uruchomienie i testowanie",
                "Możliwe kierunki rozwoju",
            ],
            s["BodyCustom"],
        )
    )

    story.append(p("1. Cel projektu", s["H1Custom"]))
    story.append(
        p(
            "Fixo jest aplikacją wspierającą pracę serwisanta wózków widłowych. "
            "System pozwala korzystać z dokumentacji technicznej w formie PDF, zadawać pytania "
            "w czacie oraz otrzymywać odpowiedzi generowane na podstawie fragmentów instrukcji "
            "powiązanych z wybranym urządzeniem.",
            s["BodyCustom"],
        )
    )
    story.append(
        p(
            "Projekt składa się z aplikacji mobilnej oraz backendu. Aplikacja mobilna odpowiada za "
            "interfejs użytkownika, czat, wybór pojazdu, obsługę źródeł PDF i funkcje głosowe. "
            "Backend udostępnia REST API, panel administracyjny, mechanizmy RAG, transkrypcję mowy, "
            "syntezę odpowiedzi audio oraz integrację z bazą danych.",
            s["BodyCustom"],
        )
    )

    story.append(p("2. Główne funkcjonalności", s["H1Custom"]))
    story.append(
        bullets(
            [
                "Wybór marki, typu oraz konkretnego modelu urządzenia serwisowego.",
                "Prowadzenie konwersacji w czacie powiązanym z wybranym urządzeniem.",
                "Wyszukiwanie informacji w zaimportowanych instrukcjach PDF.",
                "Wyświetlanie źródeł, z których korzysta odpowiedź asystenta.",
                "Obsługa transkrypcji mowy przez strumień audio oraz WebSocket.",
                "Synteza audio odpowiedzi asystenta i odtwarzanie jej po stronie aplikacji.",
                "Panel administracyjny do zarządzania markami, typami urządzeń, urządzeniami, dokumentami i rozmowami.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Instrukcja użytkowa", "Jak korzystać z aplikacji"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("3. Role użytkowników", s["H1Custom"]))
    story.append(
        table(
            [
                ["Rola", "Zakres działań"],
                [
                    "Serwisant",
                    "Korzysta z aplikacji mobilnej, wybiera urządzenie, zadaje pytania i analizuje odpowiedzi asystenta.",
                ],
                [
                    "Administrator",
                    "Zarządza danymi w panelu administracyjnym: markami, typami urządzeń, dokumentacją PDF, urządzeniami oraz rozmowami.",
                ],
            ],
            [3.2 * cm, 12.1 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("4. Scenariusz pracy serwisanta", s["H1Custom"]))
    story.append(
        bullets(
            [
                "Użytkownik uruchamia aplikację mobilną i przechodzi do ekranu wyboru lub czatu.",
                "Wybiera markę, typ urządzenia oraz model, którego dotyczy problem serwisowy.",
                "W czacie opisuje problem tekstowo lub używa wejścia głosowego.",
                "Aplikacja wysyła pytanie do backendu wraz z kontekstem aktywnego wątku.",
                "Backend wyszukuje istotne fragmenty dokumentacji i generuje odpowiedź.",
                "Użytkownik czyta odpowiedź, może odtworzyć audio i sprawdzić powiązane źródła PDF.",
                "W razie potrzeby kontynuuje rozmowę w tym samym wątku, aby doprecyzować problem.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(p("5. Ekrany aplikacji mobilnej", s["H1Custom"]))
    story.append(
        table(
            [
                ["Ekran / komponent", "Przeznaczenie"],
                ["HomeScreen / HomeActionPanel", "Start pracy, wybór akcji oraz przejście do obsługi urządzenia."],
                ["ChatScreen", "Główny widok rozmowy z asystentem serwisowym."],
                ["HistoryScreen", "Przegląd historii rozmów i powrót do wcześniejszych wątków."],
                ["SettingsScreen", "Ustawienia aplikacji i konfiguracja zachowania klienta."],
                ["VehicleFilters / VehicleCard", "Filtrowanie i prezentacja dostępnych urządzeń."],
                ["SourcePanel / PdfViewer", "Podgląd źródeł oraz instrukcji PDF użytych w odpowiedzi."],
                ["ControlPanel", "Kontrolki rozmowy, mikrofonu, audio i wysyłania wiadomości."],
            ],
            [5.0 * cm, 10.3 * cm],
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Architektura systemu", "Podział na klienta, backend i usługi zewnętrzne"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("6. Widok wysokiego poziomu", s["H1Custom"]))
    story.append(
        p(
            "System działa w architekturze klient-serwer. Aplikacja mobilna komunikuje się z backendem "
            "przez HTTPS, REST API, Server-Sent Events oraz WebSocket. Backend korzysta z PostgreSQL "
            "z rozszerzeniem pgvector, aby przechowywać dane domenowe i embeddingi fragmentów dokumentacji.",
            s["BodyCustom"],
        )
    )
    story.append(
        table(
            [
                ["Warstwa", "Technologie", "Odpowiedzialność"],
                ["Klient", "TypeScript, React Native, Expo, Expo Router", "Interfejs użytkownika, czat, PDF, mikrofon i audio."],
                ["Backend", "Python 3.12, FastAPI, SQLAlchemy, Alembic", "API, autoryzacja Bearer, logika RAG, panel admina."],
                ["Baza danych", "PostgreSQL + pgvector", "Dane urządzeń, wiadomości, dokumentów, fragmentów i wektorów."],
                ["AI / integracje", "Azure OpenAI, OpenAI, Deepgram, Gemini TTS", "Embeddingi, generowanie odpowiedzi, transkrypcja i synteza mowy."],
                ["Infrastruktura", "Docker, Docker Compose, VPS, reverse proxy", "Uruchomienie środowisk dev, staging i production."],
            ],
            [3.2 * cm, 4.6 * cm, 7.5 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("7. Przepływ odpowiedzi RAG", s["H1Custom"]))
    story.append(
        bullets(
            [
                "Aplikacja wysyła wiadomość użytkownika do backendu dla konkretnego wątku rozmowy.",
                "Backend tworzy embedding pytania z użyciem Azure OpenAI.",
                "System wyszukuje podobne fragmenty dokumentacji w PostgreSQL/pgvector i uzupełnia ranking wyszukiwaniem BM25.",
                "Model językowy otrzymuje prompt systemowy, historię rozmowy, znalezione fragmenty oraz pytanie użytkownika.",
                "Odpowiedź jest strumieniowana do klienta jako SSE, a po zakończeniu zapisywana w bazie.",
                "Powiązania między wiadomością i użytymi fragmentami są przechowywane w tabeli łączącej.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Backend", "FastAPI, modele, endpointy i usługi"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("8. Struktura backendu", s["H1Custom"]))
    story.append(
        table(
            [
                ["Ścieżka", "Znaczenie"],
                ["server/app/main.py", "Konfiguracja aplikacji FastAPI, routerów, OpenAPI oraz middleware autoryzacji."],
                ["server/app/routers/", "Endpointy REST, WebSocket i widoki panelu administracyjnego."],
                ["server/app/models/", "Modele SQLAlchemy reprezentujące tabele bazy danych."],
                ["server/app/schemas/", "Schematy Pydantic używane w API."],
                ["server/app/services/", "Logika biznesowa: ingest, chunking, embedding, retrieval, LLM, STT, TTS."],
                ["server/alembic/", "Migracje bazy danych."],
                ["server/tests/", "Testy endpointów i usług."],
            ],
            [5.3 * cm, 10.0 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("9. Najważniejsze grupy endpointów", s["H1Custom"]))
    story.append(
        table(
            [
                ["Prefiks", "Zakres"],
                ["/api/brands", "Tworzenie, pobieranie, aktualizacja i usuwanie marek."],
                ["/api/device_types", "Zarządzanie typami urządzeń."],
                ["/api/devices", "Zarządzanie urządzeniami i ich powiązaniami."],
                ["/api/attachments", "Dodawanie, pobieranie, łączenie i usuwanie dokumentów PDF."],
                ["/api/threads", "Wątki, wiadomości oraz transmisja tekstu i audio."],
                ["/api/messages", "Pobieranie informacji o źródłach użytych do utworzenia wiadomości."],
                ["/api/chunks", "Dostęp do fragmentów dokumentacji oraz ich usuwanie."],
                ["/api/images", "Pobieranie obrazów wyodrębnionych z dokumentacji."],
                ["/admin", "Panel administracyjny HTML."],
            ],
            [4.0 * cm, 11.3 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("10. Autoryzacja", s["H1Custom"]))
    story.append(
        p(
            "Backend zabezpiecza endpointy API nagłówkiem <b>Authorization: Bearer &lt;token&gt;</b>. "
            "Publiczne pozostają tylko <b>/health</b>, <b>/docs</b>, <b>/redoc</b>, <b>/openapi.json</b> oraz panel <b>/admin</b>.",
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Frontend", "React Native / Expo"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("11. Struktura aplikacji mobilnej", s["H1Custom"]))
    story.append(
        table(
            [
                ["Ścieżka", "Znaczenie"],
                ["client/app/", "Routing ekranów oparty o Expo Router."],
                ["client/components/", "Komponenty UI: czat, panel źródeł, filtry pojazdów, PDF, kontrolki."],
                ["client/hooks/", "Hooki logiki aplikacyjnej, m.in. API czatu, mikrofon, audio, ustawienia i dane pojazdów."],
                ["client/modules/", "Natywne moduły Expo: audio stream oraz wake word."],
                ["client/utils/", "Konfiguracja API, obsługa błędów i streaming czatu."],
                ["client/assets/", "Ikony, grafiki, schematy i przykładowe dokumenty."],
                ["client/__tests__/", "Testy jednostkowe i komponentowe."],
            ],
            [4.5 * cm, 10.8 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("12. Komunikacja z backendem", s["H1Custom"]))
    story.append(
        bullets(
            [
                "REST API służy do pobierania danych słownikowych, urządzeń, historii i zasobów.",
                "SSE jest używane do strumieniowania odpowiedzi asystenta i zdarzeń audio.",
                "WebSocket obsługuje strumień transkrypcji mowy dla aktywnego wątku rozmowy.",
                "Konfiguracja adresu API znajduje się po stronie klienta w mechanizmach utils/api-config.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(p("13. Funkcje głosowe", s["H1Custom"]))
    story.append(
        p(
            "Projekt zawiera moduły obsługujące mikrofon, strumieniowanie audio, wykrywanie frazy aktywującej "
            "oraz odtwarzanie odpowiedzi. Po stronie backendu transkrypcja jest przekazywana do Deepgram, "
            "a odpowiedzi mogą być syntetyzowane jako audio przez usługę TTS.",
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Baza danych i dokumenty", "Dane domenowe oraz przetwarzanie PDF"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("14. Model danych", s["H1Custom"]))
    story.append(
        table(
            [
                ["Tabela / model", "Opis"],
                ["brands", "Marki urządzeń, np. Toyota, Still, TCM."],
                ["device_types", "Typy urządzeń, np. wózek widłowy lub inna kategoria sprzętu."],
                ["devices", "Konkretne modele urządzeń wraz z marką, typem i opcjonalnym obrazem."],
                ["attachments", "Załączone instrukcje PDF oraz nazwy oryginalnych plików."],
                ["chunks", "Fragmenty tekstu wycięte z PDF wraz z embeddingiem i metadanymi."],
                ["chat_threads", "Wątki rozmów przypisane do wybranego urządzenia."],
                ["messages", "Wiadomości użytkownika i asystenta."],
                ["chunks_messages", "Powiązania odpowiedzi z fragmentami dokumentów użytymi jako źródła."],
            ],
            [4.2 * cm, 11.1 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("15. Import i wyszukiwanie dokumentacji", s["H1Custom"]))
    story.append(
        bullets(
            [
                "Administrator dodaje plik PDF jako attachment i łączy go z urządzeniem.",
                "Backend wyodrębnia treść dokumentu, dzieli ją na fragmenty i zapisuje metadane.",
                "Dla fragmentów generowane są embeddingi o rozmiarze zgodnym z modelem Azure OpenAI.",
                "Podczas rozmowy system wyszukuje fragmenty semantycznie oraz przez BM25.",
                "Odpowiedź asystenta zawiera treść wygenerowaną na podstawie znalezionych źródeł.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Uruchomienie i jakość", "Konfiguracja, testy, deployment"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("16. Wymagania narzędziowe", s["H1Custom"]))
    story.append(
        table(
            [
                ["Narzędzie", "Wersja / opis"],
                ["Node.js", "24.14.0, zgodnie z .tool-versions"],
                ["Python", "3.12.13, zgodnie z .tool-versions"],
                ["Poetry", "2.3.2, zarządzanie zależnościami backendu"],
                ["npm", "Menedżer zależności klienta - projekt nie używa bun, pnpm ani yarn"],
                ["Docker Compose", "Środowisko bazy danych oraz deployment dev/staging/production"],
            ],
            [4.0 * cm, 11.3 * cm],
            s["BodyCustom"],
        )
    )
    story.append(p("17. Uruchomienie backendu", s["H1Custom"]))
    story.append(p("cd server<br/>make install<br/>make dev", s["CodeBlock"]))
    story.append(
        p(
            "Dokumentacja OpenAPI jest dostępna pod adresem <b>http://localhost:8000/docs</b>. "
            "Przed uruchomieniem należy przygotować plik <b>server/.env</b> na podstawie <b>.env.example</b> "
            "i uzupełnić dane bazy oraz klucze usług zewnętrznych.",
            s["BodyCustom"],
        )
    )
    story.append(p("18. Uruchomienie klienta", s["H1Custom"]))
    story.append(p("cd client<br/>make install<br/>make android", s["CodeBlock"]))
    story.append(
        p(
            "Aplikacja korzysta z Expo i React Native. Wersja webowa może działać z ograniczoną funkcjonalnością, "
            "zwłaszcza w obszarze modułów natywnych, mikrofonu i odtwarzania audio.",
            s["BodyCustom"],
        )
    )
    story.append(p("19. Testy i formatowanie", s["H1Custom"]))
    story.append(
        table(
            [
                ["Obszar", "Komenda"],
                ["Backend - lint", "cd server && make lint"],
                ["Backend - typecheck", "cd server && make typecheck"],
                ["Backend - testy", "cd server && make test"],
                ["Backend - format", "cd server && make format"],
                ["Frontend - testy", "cd client && make test"],
                ["Frontend - lint", "cd client && make lint"],
                ["Frontend - format", "cd client && make format"],
            ],
            [5.0 * cm, 10.3 * cm],
            s["BodyCustom"],
        )
    )
    story.append(PageBreak())

    story.append(SectionBar("Utrzymanie i rozwój", "Dalsze prace"))
    story.append(Spacer(1, 0.25 * cm))
    story.append(p("20. Deployment", s["H1Custom"]))
    story.append(
        p(
            "Backend ma przygotowane osobne konfiguracje Docker Compose dla środowisk dev, staging i production. "
            "Wdrożenie produkcyjne działa pod domeną asystent-serwisanta.pl, a środowisko staging pod "
            "staging.asystent-serwisanta.pl. Środowiska są izolowane osobnymi kontenerami, wolumenami i portami.",
            s["BodyCustom"],
        )
    )
    story.append(p("21. Dobre praktyki utrzymaniowe", s["H1Custom"]))
    story.append(
        bullets(
            [
                "Każda nowa funkcjonalność powinna mieć testy jednostkowe lub integracyjne, jeśli jest to uzasadnione.",
                "Migracji bazy danych wdrożonych na staging lub production nie należy wycofywać przez downgrade.",
                "Zmiany powinny przechodzić lint, typecheck, format-check oraz testy automatyczne.",
                "Dokumentacja powinna być aktualizowana razem ze zmianami API, modeli danych i zachowania aplikacji.",
                "Klucze API i dane połączeń powinny pozostać w plikach środowiskowych, poza kodem źródłowym.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(p("22. Możliwe kierunki rozwoju", s["H1Custom"]))
    story.append(
        bullets(
            [
                "Rozbudowa panelu administracyjnego o statystyki użycia i jakość odpowiedzi.",
                "Automatyczna dystrybucja aplikacji mobilnej jako APK lub przez store.",
                "Dokładniejsze cytowanie źródeł z numerami stron i podświetleniem fragmentów PDF.",
                "Obsługa większej liczby typów dokumentów serwisowych.",
                "Tryb offline dla wybranych instrukcji lub historii rozmów.",
                "Rozszerzenie testów manualnych i automatycznych dla funkcji audio.",
            ],
            s["BodyCustom"],
        )
    )
    story.append(Spacer(1, 0.25 * cm))
    story.append(
        KeepTogether(
            [
                p("23. Podsumowanie", s["H1Custom"]),
                p(
                    "Fixo łączy aplikację mobilną, backend FastAPI, bazę wektorową i usługi AI "
                    "w narzędzie wspierające serwisanta podczas pracy z dokumentacją techniczną. Najważniejszą "
                    "wartością systemu jest szybkie przejście od pytania użytkownika do odpowiedzi opartej na "
                    "konkretnych instrukcjach przypisanych do danego urządzenia.",
                    s["BodyCustom"],
                ),
            ]
        )
    )

    return story


def main() -> None:
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_FILE),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.55 * cm,
        title="Dokumentacja projektu Fixo",
        author="Fixo",
        subject="Dokumentacja użytkowa i techniczna",
    )
    doc.build(build_story(), onFirstPage=draw_footer, onLaterPages=draw_footer)
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()
