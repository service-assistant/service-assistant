import re


class ChecklistStreamLimiter:
    """Limit checklist items before they are sent to an SSE client."""

    def __init__(self, limit: int = 6):
        self.limit = limit
        self.item_count = 0
        self.pending = ""
        self.in_checklist = False
        self.suppress_section = False
        self.omitted_item = ""
        self.output_suffix = ""
        self.passthrough_line = False
        self.has_intro_text = False

    def _remember_output(self, text: str) -> None:
        self.output_suffix = f"{self.output_suffix}{text}"[-2:]

    def _process_line(self, line: str) -> str:
        stripped = line.strip()
        directive = re.match(r"::(checklist|warning|next)\b", stripped, re.IGNORECASE)

        if directive:
            block_type = directive.group(1).lower()
            intro = ""
            if not self.has_intro_text:
                intro = "Postępuj zgodnie z poniższymi wskazówkami:\n\n"
                self.has_intro_text = True
            if block_type == "checklist":
                self.in_checklist = True
                self.suppress_section = self.item_count >= self.limit
                return "" if self.suppress_section else f"{intro}{line}"

            self.in_checklist = False
            self.suppress_section = block_type == "next" and bool(self.omitted_item)
            return "" if self.suppress_section else f"{intro}{line}"

        if not self.in_checklist:
            if stripped:
                self.has_intro_text = True
            return "" if self.suppress_section else line

        bullet = re.match(r"\s*[-*]\s+(.*)", line.rstrip("\r\n"))
        if bullet:
            if self.item_count < self.limit:
                self.item_count += 1
                self.suppress_section = False
                return line

            if not self.omitted_item:
                self.omitted_item = bullet.group(1).strip()
            self.suppress_section = True
            return ""

        return "" if self.suppress_section else line

    def feed(self, chunk: str) -> list[str]:
        output: list[str] = []

        if self.passthrough_line:
            if "\n" not in chunk:
                inline_bullet = re.match(r"[ \t]*[-*](?:[ \t]+|$)", chunk)
                next_character = (
                    chunk[inline_bullet.end() :].lstrip()[:1] if inline_bullet else ""
                )
                previous_character = self.output_suffix.rstrip()[-1:]
                numeric_range = (
                    previous_character.isdigit() and next_character.isdigit()
                )

                if not inline_bullet or numeric_range:
                    if chunk:
                        output.append(chunk)
                        self._remember_output(chunk)
                    return output

                output.append("\n")
                self._remember_output("\n")
                self.passthrough_line = False
                chunk = chunk.lstrip()
            else:
                line_end, chunk = chunk.split("\n", 1)
                visible_text = f"{line_end}\n"
                output.append(visible_text)
                self._remember_output(visible_text)
                self.passthrough_line = False

        self.pending += chunk

        while "\n" in self.pending:
            line, self.pending = self.pending.split("\n", 1)
            processed = self._process_line(f"{line}\n")
            if processed:
                output.append(processed)
                self._remember_output(processed)

        if self.pending and not self.in_checklist and not self.suppress_section:
            inline_directive = re.match(
                r"\s*::(checklist|warning|next)\b[ \t]*",
                self.pending,
                re.IGNORECASE,
            )
            if inline_directive:
                block_type = inline_directive.group(1).lower()
                normalized_directive = f"::{block_type}\n"
                processed = self._process_line(normalized_directive)
                self.pending = self.pending[inline_directive.end() :]
                if processed:
                    output.append(processed)
                    self._remember_output(processed)

        if self.pending and self.in_checklist and not self.suppress_section:
            if re.match(r"\s*[-*]\s+", self.pending):
                if self.item_count < self.limit:
                    self.item_count += 1
                    output.append(self.pending)
                    self._remember_output(self.pending)
                    self.pending = ""
                    self.passthrough_line = True
                else:
                    self.suppress_section = True

        if self.pending and not self.in_checklist and not self.suppress_section:
            candidate = self.pending.lstrip().lower()
            directives = ("::checklist", "::warning", "::next")
            could_be_directive = any(
                directive.startswith(candidate) or candidate.startswith(directive)
                for directive in directives
            )
            if not could_be_directive:
                output.append(self.pending)
                self._remember_output(self.pending)
                if self.pending.strip():
                    self.has_intro_text = True
                self.pending = ""
                self.passthrough_line = True

        return output

    def finish(self) -> list[str]:
        output: list[str] = []
        if self.pending:
            processed = self._process_line(self.pending)
            if processed:
                output.append(processed)
                self._remember_output(processed)
            self.pending = ""

        if self.omitted_item:
            separator = (
                ""
                if self.output_suffix.endswith("\n\n")
                else "\n"
                if self.output_suffix.endswith("\n")
                else "\n\n"
            )
            continuation = f"{separator}::next\nNastępnie: {self.omitted_item}"
            output.append(continuation)
            self._remember_output(continuation)

        return output
