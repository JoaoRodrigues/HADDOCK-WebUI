from flask import Flask

class HADDOCKApp(Flask):
    def __init__(self, name):
        super(HADDOCKApp, self).__init__(name)

# Initialize application
app = HADDOCKApp(__name__)

# Load config
from config import config
app.config.from_object(config)

if app.config['CACHE_MODEL'] or app.config['CACHE_ACCESSLEVELS']:
    from flask.ext.cache import Cache
    cache = Cache(app,config={'CACHE_TYPE': app.config['CACHE_BACKEND']})
    cache.init_app(app)
else:
    cache = None

# Set up logger
import logging
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler('log/server.log', maxBytes=4*1024**2, backupCount=1)
handler.setLevel(logging.WARNING)
app.logger.addHandler(handler)

# Import view and error scripts
from app import views, errors
