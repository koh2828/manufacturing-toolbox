"""Independent, deterministic reference values for the batch-analysis release.

Uses Python's standard-library statistics.quantiles(method='inclusive'), not
production JavaScript. Interval expectations below are hand-derived minutes.
Run this file to regenerate batch-reference.json and the synthetic CSV fixture.
"""
import csv
import json
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = Path(__file__).with_suffix('.json')


def summary(values, minimum=5):
    n = len(values)
    out = {
        'n': n,
        'status': 'insufficient' if n < minimum else 'reference' if n < 20 else 'available',
        'mean': statistics.mean(values) if n else None,
        'median': statistics.median(values) if n else None,
        'sd': statistics.stdev(values) if n > 1 else None,
        'min': min(values) if n else None,
        'max': max(values) if n else None,
        'p50': None, 'p75': None, 'p90': None, 'p95': None,
    }
    if n >= minimum:
        q = statistics.quantiles(values, n=100, method='inclusive')
        out.update(p50=q[49], p75=q[74], p90=q[89], p95=q[94])
    return out


def stamp(value):
    return value.strftime('%Y-%m-%d %H:%M:%S')


def fixture():
    headers = ['Batch ID', 'Product', 'Equipment', 'Process Step', 'Start Time',
               'End Time', 'Delay Category', 'Delay Reason', 'Target Time (min)', 'Loss Type']
    rows, expected = [], []
    for month, period in [(9, 'before'), (10, 'after')]:
        for i in range(5):
            batch = f'SYN-{month:02d}-{i+1:03d}'
            base = datetime(2026, month, i + 1, 8)
            heating = 120 + 10*i if period == 'before' else 90 + 8*i
            reaction = 240 + 10*i if period == 'before' else 180 + 5*i
            cooling = 120 if period == 'before' else 90
            transfer = 60 if period == 'before' else 45
            filtration = 90 if period == 'before' else 60
            t = base

            def add(step, start, minutes, target, equipment='SYN-KETTLE-1',
                    category='', reason='', loss_type=''):
                end = start + timedelta(minutes=minutes)
                rows.append([batch, 'SYN-RESIN-A', equipment, step, stamp(start),
                             stamp(end), category, reason, target, loss_type])
                return end

            t = add('Charging', t, 60, 60)
            t = add('Heating', t, heating, 100)
            t = add('Recorded stop', t, 20, '', category='Maintenance',
                    reason='Synthetic recorded stop; no inferred cause', loss_type='downtime')
            reaction_start = t
            t = add('Reaction', t, reaction, 180)
            # Repeated step name, separate timestamps, nested parallel intervals.
            add('Sampling', reaction_start + timedelta(minutes=30), 15, 15)
            add('Sampling', reaction_start + timedelta(minutes=90), 10, 15)
            t += timedelta(minutes=30)  # Recorded interval gap; no reason supplied.
            t = add('Cooling', t, cooling, 90)
            add('Transfer', t, transfer, 45)
            end = add('Filtration', t, filtration, 60, equipment='SYN-FILTER-1')
            elapsed = (end-base).total_seconds()/60
            summed = 60 + heating + 20 + reaction + 25 + cooling + transfer + filtration
            expected.append({'batch': batch, 'period': period, 'stepRows': 9,
                             'elapsed': elapsed, 'sumStep': summed,
                             'active': elapsed-30, 'gap': 30,
                             'overlap': summed-(elapsed-30),
                             'excess': max(0, heating-100)+max(0, reaction-180)
                                       +max(0, cooling-90)+max(0, transfer-45)
                                       +max(0, filtration-60)})

    # A separate product/equipment group intentionally below the minimum N.
    for i in range(3):
        start = datetime(2026, 10, 10+i, 23)
        rows.append([f'SYN-B-{i+1:03d}', 'SYN-RESIN-B', 'SYN-KETTLE-2', 'Reaction',
                     stamp(start), stamp(start+timedelta(minutes=120+i*30)),
                     '', '', 120, ''])

    # Invalid rows remain visible in the audit, never presented as valid durations.
    rows.extend([
        ['SYN-MISSING', 'SYN-RESIN-A', 'SYN-KETTLE-1', 'Charging',
         '2026-10-20 08:00:00', '', '', '', 60, ''],
        ['SYN-REVERSED', 'SYN-RESIN-A', 'SYN-KETTLE-1', 'Charging',
         '2026-10-21 09:00:00', '2026-10-21 08:00:00', '', '', 60, ''],
        ['SYN-BAD-DATE', 'SYN-RESIN-A', 'SYN-KETTLE-1', 'Charging',
         '2026-02-30 08:00:00', '2026-03-01 09:00:00', '', '', 60, ''],
    ])
    duplicate = ['SYN-DUP', 'SYN-RESIN-A', 'SYN-KETTLE-1', 'Charging',
                 '2026-10-22 08:00:00', '2026-10-22 09:00:00', '', '', 60, '']
    rows.extend([duplicate[:], duplicate[:]])
    # Source order is chronological where timestamps are valid; invalid date last.
    rows.sort(key=lambda row: row[4] if row[0] != 'SYN-BAD-DATE' else '9999')
    path = ROOT / 'fixtures' / 'batch-workflow.csv'
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)
    return {'path': 'tests/fixtures/batch-workflow.csv', 'sourceRows': len(rows),
            'completeReferenceBatches': expected,
            'syntheticOnly': True,
            'note': 'Three invalid rows and two copies of one exact duplicate are deliberate.'}


def build():
    cases = [
        ('five-known', [10, 20, 30, 40, 50], 5),
        ('minimum-minus-one', [10, 20, 30, 40], 5),
        ('singleton', [123], 5),
        ('empty', [], 5),
        ('constant', [60]*20, 5),
        ('iqr-all', [1, 2, 3, 4, 100], 5),
        ('iqr-retained-insufficient', [1, 2, 3, 4], 5),
        ('iqr-six-all', [10, 11, 12, 13, 14, 100], 5),
        ('iqr-six-retained', [10, 11, 12, 13, 14], 5),
    ]
    for name, values, minimum in cases:
        assert summary(values, minimum)['n'] == len(values)
    base = datetime(2026, 9, 1, 8, tzinfo=timezone.utc)
    excel1900 = (base-datetime(1899, 12, 30, tzinfo=timezone.utc)).total_seconds()/86400
    before = [120, 130, 140, 150, 160]
    after = [90, 98, 106, 114, 122]
    return {
        'format': 'manufacturing-toolbox-batch-reference', 'version': 1,
        'method': 'Python statistics.quantiles(method=inclusive), stdev(ddof=1); hand-derived interval arithmetic',
        'unit': 'minute',
        'summaries': [{'name': name, 'values': values, 'minSamples': minimum,
                       'expected': summary(values, minimum)} for name, values, minimum in cases],
        'intervals': [
            {'name': 'parallel-with-gap', 'spans': [[0, 120], [60, 180], [240, 300]],
             'expected': {'elapsed': 300, 'sumStep': 300, 'active': 240, 'gap': 60,
                          'overlap': 60, 'merged': [[0, 180], [240, 300]], 'gaps': [[180, 240]]}},
            {'name': 'nested-and-touching', 'spans': [[0, 240], [60, 120], [90, 150], [240, 300]],
             'expected': {'elapsed': 300, 'sumStep': 420, 'active': 300, 'gap': 0,
                          'overlap': 120, 'merged': [[0, 300]], 'gaps': []}},
            {'name': 'cross-midnight', 'spans': [[0, 180]],
             'expected': {'elapsed': 180, 'sumStep': 180, 'active': 180, 'gap': 0,
                          'overlap': 0, 'merged': [[0, 180]], 'gaps': []}},
        ],
        'iqr': [
            {'values': [1, 2, 3, 4, 100], 'q1': 2, 'q3': 4, 'lower': -1, 'upper': 7,
             'excludedIndices': [4], 'retained': [1, 2, 3, 4]},
            {'values': [10, 11, 12, 13, 14, 100], 'q1': 11.25, 'q3': 13.75,
             'lower': 7.5, 'upper': 17.5, 'excludedIndices': [5],
             'retained': [10, 11, 12, 13, 14]},
        ],
        'timeCases': {
            'sameInstant': ['2026-09-01T17:00:00+09:00', '2026-09-01T08:00:00Z'],
            'sameWall': ['2026-09-01 08:00:00', excel1900],
            'excel1900': excel1900, 'excel1904': excel1900-1462,
            'expectedMs': int(base.timestamp()*1000),
            'crossMidnight': ['2026-09-01 23:00:00', '2026-09-02 02:00:00'],
            'crossMidnightMinutes': 180,
            'invalid': ['', '08:00', '2026-02-30 08:00:00', '2026-09-01 24:00:00',
                        '2026-09-01T08:00:00+14:01', 60],
            'mixedClockKindsMustNotBeCombined': ['2026-09-01 08:00:00', '2026-09-01T08:00:00Z'],
        },
        'beforeAfter': {
            'product': 'SYN-RESIN-A', 'equipment': 'SYN-KETTLE-1', 'step': 'Heating',
            'before': summary(before), 'after': summary(after),
            'deltaAfterMinusBeforeMinutes': {'mean': -34, 'median': -34, 'p90': -37.2, 'p95': -37.6},
            'meanReductionMinutes': 34, 'meanReductionHours': 34/60,
            'meanReductionPercent': 34/140*100,
            'causality': 'Descriptive comparison only; no causal claim.'
        },
        'fixture': fixture(),
    }


if __name__ == '__main__':
    result = build()
    REFERENCE.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Generated {REFERENCE.name} and {result["fixture"]["path"]}: {result["fixture"]["sourceRows"]} synthetic rows')
