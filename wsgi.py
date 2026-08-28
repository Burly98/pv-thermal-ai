from backend.client_api_v2 import app


if __name__ == "__main__":
    import os

    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5070")),
        debug=False,
        threaded=True,
    )
