from __future__ import annotations

from cleaner import clean_html


def test_cleaner_strips_scripts_nav_footer_svg_and_keeps_text() -> None:
    sample_html = """
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Page</title>
        <style>body { color: red; }</style>
        <script>console.log("bad");</script>
      </head>
      <body>
        <nav><a href="/">Home</a></nav>
        <main>
          <h1>Book Title</h1>
          <p>Visible content description.</p>
          <svg><path d="M0 0h24v24H0z"/></svg>
          <noscript>Please enable JS</noscript>
        </main>
        <footer>Copyright 2026</footer>
      </body>
    </html>
    """

    cleaned = clean_html(sample_html)

    # Stripped tags should not be in cleaned HTML
    assert "<script" not in cleaned.html
    assert "<style" not in cleaned.html
    assert "<nav" not in cleaned.html
    assert "<footer" not in cleaned.html
    assert "<svg" not in cleaned.html
    assert "<noscript" not in cleaned.html

    # Visible content in main must be retained
    assert "Book Title" in cleaned.text
    assert "Visible content description." in cleaned.text

    # Stripped content must not be in visible text
    assert "Home" not in cleaned.text
    assert "Copyright" not in cleaned.text
    assert "bad" not in cleaned.text
    assert "Please enable JS" not in cleaned.text

    # Lines should be collapsed with no excessive blank lines
    assert "\n\n\n" not in cleaned.text
