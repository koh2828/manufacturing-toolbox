"""Independent statistical reference fixtures (Python standard library only).

This does not import or call the Manufacturing Toolbox implementation. Decimal
arithmetic at 50 digits and direct two-pass variance supply independent expected
values for the JavaScript regression suite. Run this file to recreate its JSON.
All example measurement data other than NIST's published I-chart example are
synthetic. Xbar-R values derive A2/D3/D4 from the published rounded d2/d3 table;
the alternate rounded chart-factor convention is recorded explicitly.
"""
from decimal import Decimal, getcontext
from pathlib import Path
import json

getcontext().prec = 50
D = lambda x: Decimal(str(x))

SOURCES = {
    "individuals": "https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm",
    "xbar_r": "https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc311.htm",
    "capability": "https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc16.htm",
    "sigma_constants": "https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/capability-analysis/how-to/capability-analysis/normal-capability-analysis/methods-and-formulas/methods/",
    "nelson": "https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/control-charts/supporting-topics/basics/using-tests-for-special-causes/",
    "quantile_r7": "https://stat.ethz.ch/R-manual/R-patched/library/stats/html/quantile.html",
    "quantile_excel": "https://support.microsoft.com/en-us/excel/functions/percentile-inc-function",
}

# d2 and d3 from the primary Minitab source above, as printed.
D_CONSTANTS = {
    2: ("1.128", "0.8525"), 3: ("1.693", "0.8884"),
    4: ("2.059", "0.8798"), 5: ("2.326", "0.8641"),
    6: ("2.534", "0.8480"), 7: ("2.704", "0.8332"),
    8: ("2.847", "0.8198"), 9: ("2.970", "0.8078"),
    10: ("3.078", "0.7971"),
}


def average(xs):
    return sum(xs, D(0)) / len(xs)


def sample_sd(xs):
    mu = average(xs)
    return (sum(((x-mu)**2 for x in xs), D(0))/(len(xs)-1)).sqrt()


def capability(mu, sigma, lsl, usl):
    if sigma is None or sigma == 0:
        return (None, None)
    cp = None if lsl is None or usl is None else (D(usl)-D(lsl))/(6*sigma)
    sides = ([] if lsl is None else [(mu-D(lsl))/(3*sigma)]) + ([] if usl is None else [(D(usl)-mu)/(3*sigma)])
    return cp, min(sides) if sides else None


def individuals(name, values, lsl, usl):
    records = [(i, D(x)) for i, x in enumerate(values) if x is not None]
    xs = [x for _, x in records]
    mrs = [abs(D(values[i])-D(values[i-1])) for i in range(1, len(values))
           if values[i] is not None and values[i-1] is not None]
    mu, sd = average(xs), sample_sd(xs)
    mr = average(mrs) if mrs else None
    sigma = mr / D("1.128") if mr is not None else None
    cp, cpk = capability(mu, sigma, lsl, usl)
    pp, ppk = capability(mu, sd, lsl, usl)
    expected = {"n": len(xs), "excluded": len(values)-len(xs), "mean": mu,
                "sd": sd, "mr": mr, "within": sigma, "cp": cp, "cpk": cpk,
                "pp": pp, "ppk": ppk,
                "lcl": mu-3*sigma if sigma is not None else None,
                "ucl": mu+3*sigma if sigma is not None else None,
                "movingRanges": mrs,
                "mrLcl": D(0) if mr is not None else None,
                "mrUclDerived": (1+3*D("0.8525")/D("1.128"))*mr if mr is not None else None,
                "mrUclRoundedD4": D("3.267")*mr if mr is not None else None,
                "oosIndices": [i for i, x in records if (lsl is not None and x < D(lsl)) or (usl is not None and x > D(usl))]}
    return {"name": name, "raw": values, "lsl": lsl, "usl": usl, "expected": expected}


def xbar_fixture(n):
    groups = [[D(100)+D(j)/2+shift for j in range(n)] for shift in map(D, [0, ".2", "-.1", ".4"])]
    d2, d3 = map(D, D_CONSTANTS[n])
    a2 = 3/(d2*D(n).sqrt())
    d3factor, d4factor = max(D(0), 1-3*d3/d2), 1+3*d3/d2
    means = list(map(average, groups))
    ranges = [max(g)-min(g) for g in groups]
    mu, rbar = average(means), average(ranges)
    sigma = rbar/d2
    all_values = [x for g in groups for x in g]
    cp, cpk = capability(mu, sigma, 95, 110)
    pp, ppk = capability(mu, sample_sd(all_values), 95, 110)
    return {"name": f"equal-size-subgroups-n{n}", "subgroupSize": n,
            "groups": groups, "lsl": 95, "usl": 110,
            "constants": {"d2": d2, "d3": d3, "A2": a2, "D3": d3factor, "D4": d4factor},
            "expected": {"mean": mu, "sd": sample_sd(all_values), "within": sigma,
                         "groupMeans": means, "groupRanges": ranges,
                         "rangeMean": rbar, "xbarLcl": mu-a2*rbar,
                         "xbarUcl": mu+a2*rbar, "rangeLcl": d3factor*rbar,
                         "rangeUcl": d4factor*rbar, "cp": cp, "cpk": cpk,
                         "pp": pp, "ppk": ppk}}


def percentile(xs, p):
    ordered = sorted(map(D, xs))
    rank = (len(ordered)-1)*D(p)
    lower = int(rank)
    fraction = rank-lower
    return ordered[lower]*(1-fraction) + ordered[min(lower+1, len(ordered)-1)]*fraction


def pareto_reference():
    # A second A demonstrates aggregation prior to sorting, and tied values
    # demonstrate stable input order. The negative/missing rows are excluded.
    raw = [["Scratch", 20], ["Bubble", 22], ["Scratch", 21], ["Color", 16], ["Other", 21], ["Invalid", -1], ["", 8]]
    sums = {}
    excluded = 0
    for category, amount in raw:
        if not category or amount < 0:
            excluded += 1
            continue
        sums[category] = sums.get(category, D(0))+D(amount)
    total = sum(sums.values())
    cumulative = D(0)
    items = []
    for category, amount in sorted(sums.items(), key=lambda x: -x[1]):
        cumulative += amount
        items.append({"label": category, "value": amount, "percent": 100*amount/total, "cumulative": 100*cumulative/total})
    return {"raw": raw, "expected": {"total": total, "excluded": excluded, "items": items}}


# Each vector specifies one target Nelson test. Other tests can also fire; test
# the target rule's expected final point, not exclusivity across all eight rules.
NELSON_VECTORS = [
    {"rule": 1, "values": [0, 3, -3, 3.01], "triggerIndex": 3, "negative": [0, 3, -3]},
    {"rule": 2, "values": [0.2]*9, "triggerIndex": 8, "negative": [0.2]*4+[0]+[0.2]*4},
    {"rule": 3, "values": [-.5, -.3, -.1, .1, .3, .5], "triggerIndex": 5, "negative": [-.5, -.3, -.1, -.1, .3, .5]},
    {"rule": 4, "values": [-.5, .5]*7, "triggerIndex": 13, "negative": [-.5, .5]*6+[-.5, -.5]},
    {"rule": 5, "values": [2.1, 0, 2.2], "triggerIndex": 2, "negative": [2.1, 0, -2.2]},
    {"rule": 6, "values": [1.1, 1.2, 0, 1.3, 1.4], "triggerIndex": 4, "negative": [1.1, 1.2, 0, -1.3, -1.4]},
    {"rule": 7, "values": [-.5, .5]*7+[0], "triggerIndex": 14, "negative": [-.5, .5]*7+[1.1]},
    {"rule": 8, "values": [-1.5, 1.5]*4, "triggerIndex": 7, "negative": [-1.5, 1.5]*3+[-1.5, 1]},
]


def nelson_reference(values, center=0, sigma=1):
    """Brute-force sliding windows using original positions and exact Decimal.

    Report the ending point of every qualifying window. Missing values reset
    windows by making every containing window ineligible. Never compress data.
    """
    if sigma <= 0:
        return []
    z = [None if x is None else (D(x)-D(center))/D(sigma) for x in values]
    windows = {1: 1, 2: 9, 3: 6, 4: 14, 5: 3, 6: 5, 7: 15, 8: 8}
    results = []
    for end in range(len(z)):
        for rule, length in windows.items():
            start = end-length+1
            if start < 0:
                continue
            window = z[start:end+1]
            if any(x is None for x in window):
                continue
            diffs = [b-a for a, b in zip(window, window[1:])]
            hit = {
                1: lambda: abs(window[0]) > 3,
                2: lambda: all(x > 0 for x in window) or all(x < 0 for x in window),
                3: lambda: all(x > 0 for x in diffs) or all(x < 0 for x in diffs),
                4: lambda: all(a*b < 0 for a, b in zip(diffs, diffs[1:])),
                5: lambda: sum(x > 2 for x in window) >= 2 or sum(x < -2 for x in window) >= 2,
                6: lambda: sum(x > 1 for x in window) >= 4 or sum(x < -1 for x in window) >= 4,
                7: lambda: all(abs(x) <= 1 for x in window),
                8: lambda: all(abs(x) > 1 for x in window),
            }[rule]()
            if hit:
                results.append({"rule": rule, "index": end, "startIndex": start})
    return results


def normalize(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    return value


def build():
    result = {
        "description": "Independent Python Decimal reference; no app implementation imported; formula verification does not claim Microsoft Excel or Minitab was executed.",
        "precision": 50,
        "sources": SOURCES,
        "conventions": {
            "overallSD": "Sample SD with n-1 denominator, no c4 correction.",
            "withinSD": "XmR MRbar/1.128; equal-size Xbar-R Rbar/d2.",
            "xbarRLimits": "A2=3/(d2*sqrt(n)); D3=max(0,1-3*d3/d2); D4=1+3*d3/d2. Coefficients derive from published d2/d3; conventional 3-decimal chart factors give slightly different limits.",
            "quantile": "R type 7 / Excel PERCENTILE.INC convention: zero-based rank (n-1)*p, linear interpolation.",
            "missing": "Missing individual values break moving-range adjacency and Nelson runs. Incomplete rational subgroups must not be compressed/repacked.",
            "nelson": "Vectors use fixed center=0 and sigma=1; strict greater-than sigma thresholds and strict increasing/decreasing; center ties break side runs. Rule7 uses <=1 and missing values break all windows as explicit tool conventions; Minitab prose does not specify these two edge policies. Rule8 requires every abs(z)>1; either side is allowed without requiring both sides.",
        },
        "individuals": [
            individuals("hand-calculable-five", [1, 2, 3, 4, 5], 0, 6),
            individuals("nist-published-flowrate", [49.6, 47.6, 49.9, 51.3, 47.8, 51.2, 52.6, 52.4, 53.6, 52.1], 45, 55),
            individuals("missing-breaks-adjacency", [1, 2, None, 100, 101], 0, 110),
            individuals("no-valid-moving-range", [1, None, 2, None, 3], 0, 4),
            individuals("constant-data", [3, 3, 3], 0, 6),
            individuals("one-sided-specification", [1, 2, 3], None, 2),
            individuals("negative-capability", [5, 6, 7], 0, 3),
        ],
        "xbarR": [xbar_fixture(n) for n in range(2, 11)],
        "pareto": pareto_reference(),
        "quantiles": [
            {"values": xs, "p25": percentile(xs, ".25"), "p50": percentile(xs, ".5")}
            for xs in [[40, 10, 30, 20], [12, 24, 48, 72, 144], [12, 12, 24, 48, 72, 144], [1]]
        ],
        "cycle": {
            "columns": {"product": 0, "lot": 1, "start": 2, "end": 3, "equipment": -1},
            "rows": [["A", "A2", "2026-09-01 13:00", "2026-09-01 14:00"], ["B", "B1", "2026-09-01 10:00", "2026-09-01 12:00"], ["A", "A1", "2026-09-01 08:00", "2026-09-01 09:00"], ["A", "A3", "2026-09-01 16:00", "2026-09-01 17:00"]],
            "expected": {"processingMinutesByInputIndex": [60, 120, 60, 60], "gapMinutesByInputIndex": [120, 60, 60, None], "cycleMinutesByInputIndex": [180, 180, 120, None], "productACycleN": 2, "productACycleP25": 135, "productACycleP50": 150},
        },
        "nelsonTargetVectors": [{**v, "expectedAllSignals": nelson_reference(v["values"]),
                                 "negativeExpectedAllSignals": nelson_reference(v["negative"])} for v in NELSON_VECTORS],
        "nelsonBoundaryFixtures": [
            {"name": name, "values": xs, "expected": nelson_reference(xs)}
            for name, xs in [
                ("rule7-includes-one-sigma-boundary", [-1, 1]*7+[0]),
                ("missing-breaks-side-run", [.1]*5+[None]+[.2]*5),
                ("same-side-rule8-convention", [1.5]*8),
                ("repeated-runs-report-each-ending-point", [.1]*11),
            ]
        ],
    }
    return normalize(result)


if __name__ == "__main__":
    output = Path(__file__).with_suffix(".json")
    result = build()
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"output": str(output), "individuals": len(result["individuals"]), "xbarR": len(result["xbarR"]), "nelsonRules": len(result["nelsonTargetVectors"])}))
