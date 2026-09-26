# Configuração comum da documentação (Sphinx + tema do Read the Docs + MyST), usada por pt/conf.py e en/conf.py.
# Build: ./scripts/docs  →  _build/html (português) e _build/html/en (inglês).
import os

_here = os.path.dirname(os.path.abspath(__file__))

project = 'MagFEM'
author = 'Thales Maia'
copyright = '2026, Thales Maia'
version = '1.0'
release = '1.0.0'

extensions = ['myst_parser']
myst_enable_extensions = ['colon_fence', 'dollarmath', 'amsmath', 'deflist']
myst_heading_anchors = 3
source_suffix = {'.md': 'markdown'}
exclude_patterns = ['_build', '.venv']

templates_path = [os.path.join(_here, '_templates')]
html_static_path = [os.path.join(_here, '_static')]
html_css_files = ['custom.css']

html_theme = 'sphinx_rtd_theme'
html_logo = os.path.join(_here, '_static', 'magfem-logo.png')
html_favicon = os.path.join(_here, '_static', 'favicon.png')
html_show_sourcelink = False
html_theme_options = {
    'logo_only': False,
    'navigation_depth': 3,
    'collapse_navigation': False,
    'prev_next_buttons_location': 'bottom',
}

APP_URL = 'https://thalesmaia.com/tools/magfem-web/'
REPO_URL = 'https://github.com/thalesmaoa/magfem'


def context(lang: str) -> dict:
    """Contexto dos templates: idioma atual (seletor PT/EN no rodapé do menu) e links do GitHub."""
    return {
        'lang_code': lang,
        'app_url': APP_URL,
        'repo_url': REPO_URL,
        # "Editar no GitHub" no topo de cada página.
        'display_github': True,
        'github_user': 'thalesmaoa',
        'github_repo': 'magfem',
        'github_version': 'main',
        'conf_py_path': f'/docs/{lang}/',
    }
