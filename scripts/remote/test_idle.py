import unittest
from idle import IdleTimer


class IdleTests(unittest.TestCase):
    def test_sleep_once_after_ten_minutes_then_wake_on_io(self):
        timer = IdleTimer()
        self.assertFalse(timer.update(0, (1, 10)))
        self.assertFalse(timer.update(599, (1, 10)))
        self.assertTrue(timer.update(600, (1, 10)))
        self.assertFalse(timer.update(1200, (1, 10)))
        self.assertFalse(timer.update(1201, (1, 11)))
        self.assertTrue(timer.update(1801, (1, 11)))

    def test_scan_or_buffered_playback_activity_delays_sleep(self):
        timer = IdleTimer()
        timer.update(0, (1, 10))
        self.assertFalse(timer.update(600, (1, 10), activity=590))
        self.assertFalse(timer.update(1189, (1, 10), activity=590))
        self.assertTrue(timer.update(1190, (1, 10), activity=590))

    def test_inflight_io_and_reconnect_reset_idle(self):
        timer = IdleTimer()
        timer.update(0, (1, 10))
        self.assertFalse(timer.update(600, (1, 10), busy=True))
        self.assertFalse(timer.update(1200, None))
        self.assertFalse(timer.update(1201, (2, 10)))
        self.assertTrue(timer.update(1801, (2, 10)))

    def test_stale_or_future_lease_does_not_hold_drive_forever(self):
        timer = IdleTimer()
        timer.update(100, (1, 10))
        self.assertTrue(timer.update(700, (1, 10), activity=10000))

if __name__ == '__main__':
    unittest.main()
