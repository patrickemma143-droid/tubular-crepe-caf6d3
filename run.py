#!/usr/bin/env python3
"""
Farm Management System — Application Runner
Run this file to start the local server.
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,          # Remove in production build
        log_level="info",
    )
