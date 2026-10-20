import unittest
from airtable_hourly_rollup import report

class RollupTests(unittest.TestCase):
    def test_missing_runner_is_not_zero(self):
        result = report({'ok': True, 'hourly': []}, {'ok': False, 'hourly': []}, '2026-10-20T12:00:00Z')
        self.assertFalse(result['core_sources_collected'])
        self.assertIsNone(result['net_saved_requests'])

if __name__ == '__main__':
    unittest.main()
