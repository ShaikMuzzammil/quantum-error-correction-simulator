"""
app.py - Flask routes only. All quantum logic lives in qec_simulator.py.

Run:  python app.py      then open  http://127.0.0.1:5000
"""

import base64
import binascii

import qiskit
import qiskit_aer
from flask import Flask, jsonify, render_template, request, send_from_directory

import qec_simulator as sim

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # PNG uploads

MAX_SHOTS = 20000


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def parse_config(data):
    """Validate the JSON body. Returns a clean dict or raises ValueError(list)."""
    errors = []
    data = data or {}

    code = data.get("code")
    if code not in sim.CODE_INFO:
        errors.append("Choose a QEC code: bit_flip, phase_flip or shor.")

    noise = data.get("noise")
    if noise not in sim.NOISE_INFO:
        errors.append("Choose a noise model: bit_flip, phase_flip or depolarizing.")

    try:
        input_bit = int(data.get("input_bit"))
        if input_bit not in (0, 1):
            raise ValueError
    except (TypeError, ValueError):
        errors.append("Input bit must be 0 or 1.")
        input_bit = 0

    try:
        probability = float(data.get("probability_percent", 0)) / 100.0
        if not 0.0 <= probability <= 1.0:
            raise ValueError
    except (TypeError, ValueError):
        errors.append("Noise probability must be a number between 0 and 100 %.")
        probability = 0.0

    try:
        shots = int(data.get("shots", 1000))
        if not 1 <= shots <= MAX_SHOTS:
            raise ValueError
    except (TypeError, ValueError):
        errors.append(f"Shots must be a whole number between 1 and {MAX_SHOTS}.")
        shots = 1000

    scope = data.get("noise_scope", "selected")
    if scope not in ("selected", "all"):
        errors.append("Noise scope must be 'selected' or 'all'.")
        scope = "selected"

    basis = data.get("basis", "auto")
    if basis not in ("auto", "Z", "X"):
        errors.append("Basis must be auto, Z or X.")
        basis = "auto"

    n = sim.CODE_INFO[code]["data_qubits"] if code in sim.CODE_INFO else 3
    try:
        error_qubit = int(data.get("error_qubit", 0))
        if scope == "selected" and not 0 <= error_qubit < n:
            errors.append(f"Error qubit must be between 0 and {n - 1} for this code.")
    except (TypeError, ValueError):
        errors.append("Error qubit must be a whole number.")
        error_qubit = 0

    try:
        step = float(data.get("step_percent", 10))
        if not 0.5 <= step <= 100:
            raise ValueError
    except (TypeError, ValueError):
        errors.append("Step must be between 0.5 and 100 percent.")
        step = 10.0

    if errors:
        raise ValueError(errors)

    return dict(code=code, noise=noise, input_bit=input_bit,
                probability=probability, shots=shots, noise_scope=scope,
                basis=basis, error_qubit=error_qubit, step_percent=step)


def bad_request(exc):
    errs = exc.args[0] if exc.args and isinstance(exc.args[0], list) else [str(exc)]
    return jsonify({"ok": False, "errors": errs}), 400


def server_error(exc):
    return jsonify({"ok": False, "errors": [f"{type(exc).__name__}: {exc}"]}), 500


# ---------------------------------------------------------------------------
# Pages and API
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    return jsonify({"ok": True, "qiskit": qiskit.__version__,
                    "qiskit_aer": qiskit_aer.__version__,
                    "output_dir": str(sim.OUTPUT_DIR)})


@app.route("/api/circuit", methods=["POST"])
def api_circuit():
    """Circuit + compatibility warnings for the current selection."""
    try:
        cfg = parse_config(request.get_json(silent=True))
        basis = sim.resolve_basis(cfg["code"], cfg["noise"], cfg["basis"])
        qc = sim.build_circuit(cfg["code"], cfg["input_bit"], cfg["error_qubit"],
                               cfg["noise_scope"], basis)
        status, msgs = sim.compatibility(cfg["code"], cfg["noise"], cfg["noise_scope"],
                                         basis, cfg["probability"])
        return jsonify({"ok": True, "circuit": sim.circuit_text(qc), "basis": basis,
                        "status": status, "messages": msgs,
                        "explanation": sim.EXPLANATIONS[cfg["code"]],
                        "stats": {"qubits": qc.num_qubits, "clbits": qc.num_clbits,
                                  "depth": qc.depth(), "size": qc.size()}})
    except ValueError as e:
        return bad_request(e)
    except Exception as e:
        return server_error(e)


@app.route("/api/run", methods=["POST"])
def api_run():
    try:
        cfg = parse_config(request.get_json(silent=True))
        result = sim.run_experiment(
            cfg["code"], cfg["input_bit"], cfg["noise"], cfg["probability"],
            cfg["shots"], cfg["error_qubit"], cfg["noise_scope"], cfg["basis"])
        result["ok"] = True
        return jsonify(result)
    except ValueError as e:
        return bad_request(e)
    except Exception as e:
        return server_error(e)


@app.route("/api/validate", methods=["POST"])
def api_validate():
    try:
        cfg = parse_config(request.get_json(silent=True))
        tests = sim.run_validation(cfg["code"])
        return jsonify({"ok": True, "code_name": sim.CODE_INFO[cfg["code"]]["name"],
                        "tests": tests, "all_passed": all(t["passed"] for t in tests)})
    except ValueError as e:
        return bad_request(e)
    except Exception as e:
        return server_error(e)


@app.route("/api/experiment", methods=["POST"])
def api_experiment():
    """Automatic sweep over noise probabilities. Saves a CSV in output/."""
    try:
        cfg = parse_config(request.get_json(silent=True))
        rows = sim.run_sweep(cfg["code"], cfg["input_bit"], cfg["noise"],
                             cfg["shots"], cfg["error_qubit"], cfg["noise_scope"],
                             cfg["basis"], cfg["step_percent"])
        try:
            csv_name = sim.save_csv(rows)
            csv_err = None
        except (OSError, PermissionError) as e:
            csv_name, csv_err = None, str(e)
        return jsonify({"ok": True, "rows": rows, "csv_file": csv_name,
                        "csv_error": csv_err, "output_dir": str(sim.OUTPUT_DIR)})
    except ValueError as e:
        return bad_request(e)
    except Exception as e:
        return server_error(e)


@app.route("/api/save_graph", methods=["POST"])
def api_save_graph():
    """Receives the chart as a PNG data-URL, stores it in output/."""
    try:
        body = request.get_json(silent=True) or {}
        url = body.get("image", "")
        if not url.startswith("data:image/png;base64,"):
            raise ValueError(["Expected a PNG image."])
        try:
            raw = base64.b64decode(url.split(",", 1)[1], validate=True)
        except (binascii.Error, ValueError):
            raise ValueError(["Image data is not valid base64."])
        name = sim.save_png_bytes(raw, body.get("label", "qec_graph"))
        return jsonify({"ok": True, "file": name})
    except ValueError as e:
        return bad_request(e)
    except Exception as e:
        return server_error(e)


@app.route("/api/download/<path:filename>")
def api_download(filename):
    if not (filename.endswith(".csv") or filename.endswith(".png")):
        return jsonify({"ok": False, "errors": ["Unsupported file type."]}), 400
    return send_from_directory(sim.OUTPUT_DIR, filename, as_attachment=True)


if __name__ == "__main__":
    sim.ensure_output_dir()
    app.run(host="127.0.0.1", port=5000, debug=False)
