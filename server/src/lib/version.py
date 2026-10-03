"""Expose installed release metadata derived from the shared VERSION.txt at build time."""

from importlib.metadata import version

VERSION = version("tabvault-local-server")
