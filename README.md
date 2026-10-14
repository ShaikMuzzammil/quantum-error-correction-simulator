# Quantum Error Correction Simulator (Flask + Qiskit)

Interactive website for simulating quantum noise and comparing three QEC codes:
3-qubit bit-flip, 3-qubit phase-flip and 9-qubit Shor. Every number on the
site comes from a real Qiskit Aer simulation.

## Run on Windows (VS Code terminal, PowerShell)

```powershell
cd path\to\quantum-qec-simulator
.\venv\Scripts\Activate.ps1        # your existing virtual environment (adjust the path)
pip install -r requirements.txt    # only needed if Flask is missing
python app.py
```

Open **http://127.0.0.1:5000** in your browser. Stop the server with Ctrl+C.
If PowerShell blocks the activate script, run once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Command-line version (your original program, now with Shor as option 3):

```powershell
python qec_simulator.py
```

Tests (stop nothing; the first needs no server, the second needs `python app.py` running):

```powershell
python tests\run_validation.py
python tests\test_api.py
```

## Files

| File | Purpose |
|---|---|
| `qec_simulator.py` | All Qiskit code: circuits, noise, analysis, sweep, CSV, validation, CLI |
| `app.py` | Flask routes (JSON API) |
| `templates/index.html` | Page |
| `static/css/style.css`, `static/js/app.js` | Styling and front-end logic |
| `static/js/chart.umd.js` | Chart.js 4.4.1, bundled so the site works offline |
| `output/` | CSV and PNG files saved by the site (created automatically) |
| `tests/` | Validation and API tests |

## Noise convention

"Noise probability" p is the **total** probability that a noisy qubit gets an error.

* Bit-flip: X with probability p. Phase-flip: Z with probability p.
* Depolarizing: X, Y, Z with probability p/3 each. Aer's `depolarizing_error(lam, 1)`
  uses `rho -> (1-lam) rho + lam I/2`, i.e. a total Pauli error probability of 3*lam/4,
  so the code passes `lam = 4p/3`. (The original script passed p directly, which gave a
  real error probability of only 0.75p.)
* Noise is attached to explicit `id` gates (shown as `I` in the circuit) and circuits
  are simulated without transpiling, so those gates cannot be optimised away.
* Only data qubits are noisy. Ancillas, syndrome extraction and recovery are noise-free.

## Logical basis

* **Z**: logical input |0> or |1>. **X**: logical input |+> or |->. Readout is in the same basis.
* A basis only reveals one kind of logical failure, so a bit-flip code looks perfect against
  Z noise in basis Z even though it does not protect phase. "Auto" picks the basis that
  matches the noise. Your original phase-flip circuit is the X-basis version.

## Changes made to the original code

1. `input()` prompts moved into `cli_main()` behind `if __name__ == "__main__"`.
2. Depolarizing parameter fixed (see above).
3. Phase-flip circuit generalised with a basis option (default X = your original circuit).
4. Optional noise on all data qubits; Shor code added; extra outputs (detected / corrected).
5. Syndrome table, bit ordering and corrections kept as in your code.

## Shor code layout

17 qubits: q0-q8 data (blocks 0-2, 3-5, 6-8), q9-q14 bit-flip ancillas (two per block),
q15-q16 phase-flip ancillas. Encoding: CX(0,3), CX(0,6), H on 0/3/6, then CX inside each block.
Syndrome: ZZ checks inside blocks (X errors), X^6 checks between blocks (Z errors).
Y = X and Z together, so both syndromes fire. Recovery uses one conditional per syndrome value.

## Limitations (also shown on the site)

* The 3-qubit codes correct one error of their own type; the Shor code corrects any
  single-qubit X, Y or Z, but not arbitrary multi-qubit errors. Independent noise on all
  nine qubits can create several errors, and Shor can then do worse than one bare qubit
  because it exposes nine noisy qubits instead of one. The comparison panel reports this honestly.
* Results are statistical: about +/-1 to 1.5 percentage points at 1000 shots.
* This is not a fault-tolerance simulation (ancilla/gate noise is not modelled).
