import os
import sys

sys.path.insert(0, os.path.abspath('..'))
from conf_common import *  # noqa: E402,F401,F403
from conf_common import context  # noqa: E402

language = 'en'
html_title = 'MagFEM'
html_context = context('en')
