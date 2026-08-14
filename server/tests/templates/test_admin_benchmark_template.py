from pathlib import Path


TEMPLATES_DIR = Path(__file__).parents[2] / "app" / "templates" / "admin"


def test_benchmark_template_supports_running_all_cases_and_average_scores():
    template = (TEMPLATES_DIR / "benchmark.html").read_text(encoding="utf-8")

    assert 'id="run-all-cases"' in template
    assert "Promise.allSettled" in template
    assert 'id="average-required-facts"' in template
    assert 'id="average-fact-coverage"' in template
    assert "result.score" in template
    assert "result.chunk_fact_coverage" in template


def test_benchmark_template_colors_case_selectors_by_required_facts_threshold():
    template = (TEMPLATES_DIR / "benchmark.html").read_text(encoding="utf-8")

    assert "result.required_facts_threshold_passed" in template
    assert "border-green-300 bg-green-100" in template
    assert "border-red-300 bg-red-100" in template
