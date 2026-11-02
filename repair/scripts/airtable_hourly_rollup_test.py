import unittest
from airtable_hourly_rollup import report

class RollupTests(unittest.TestCase):
    def test_missing_runner_is_not_zero(self):
        result = report({'ok': True, 'hourly': []}, {'ok': False, 'hourly': []}, '2026-10-20T12:00:00Z')
        self.assertFalse(result['core_sources_collected'])
        self.assertIsNone(result['net_saved_requests'])

    def test_partial_hour_history_blocks_spurious_difference(self):
        worker = {'ok': True, 'hourly': [
            {'hour_utc': '2026-10-20T10:00:00Z', 'source': 'studio_worker_gateway',
             'method': 'GET', 'status_class': '2xx', 'attempts': 250}
        ]}
        runner = {'ok': True, 'hourly': [
            {'hour_utc': '2026-10-20T11:00:00Z', 'source': 'pipeline_runner_http',
             'method': 'GET', 'status_class': '2xx', 'attempts': 28}
        ]}
        value = report(worker, runner, '2026-10-20T12:00:00Z')
        self.assertTrue(value['core_sources_collected'])
        self.assertFalse(value['hourly_coverage_sufficient_for_observed_difference'])
        self.assertIsNone(value['observed_difference_requests'])
        self.assertIsNone(value['net_saved_requests'])

    def test_exact_429_counts_are_reported_without_relabeling_legacy_4xx(self):
        hour = '2026-10-20T10:00:00Z'
        worker = {'ok': True, 'hourly': [
            {'hour_utc': hour, 'source': 'studio_worker_gateway', 'method': 'GET', 'status_class': '429', 'attempts': 3},
            {'hour_utc': hour, 'source': 'studio_worker_gateway', 'method': 'GET', 'status_class': '4xx', 'attempts': 4},
            {'hour_utc': hour, 'source': 'studio_worker_gateway', 'method': 'GET', 'status_class': '2xx', 'attempts': 7},
        ]}
        runner = {'ok': True, 'hourly': [
            {'hour_utc': hour, 'source': 'pipeline_runner_http', 'method': 'POST', 'status_class': '429', 'attempts': 2},
        ]}
        result = report(worker, runner, '2026-10-20T12:00:00Z')
        recent = result['latest_complete_24h']
        self.assertEqual(recent['attempts_observed'], 16)
        self.assertEqual(recent['known_429_attempts'], 5)
        self.assertEqual(recent['known_429_by_source']['studio_worker_gateway'], 3)
        self.assertEqual(recent['known_429_by_source']['pipeline_runner_http'], 2)
        self.assertEqual(recent['ambiguous_legacy_4xx_attempts'], 4)
        self.assertIsNone(result['net_saved_requests'])

if __name__ == '__main__':
    unittest.main()
