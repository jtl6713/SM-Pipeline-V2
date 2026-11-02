import unittest

from rendering_review.library_discovery import (
    requested_library_names, exact_library_name_formula, MAX_REQUESTED_NAMES
)


class ExactReviewLibraryDiscoveryTests(unittest.TestCase):
    def test_seven_adler_names_from_user_list_without_producer_misinformation(self):
        messages = [
            {"role": "producer", "content": "Adler Planetarium 99"},
            {"role": "user", "content": "Replace the shots with Adler Planetarium 3, 5, 12, 13, 14, 17, 18."},
            {"role": "user", "content": "I have verified these exact photos:\n"
             "Adler Planetarium 3\nAdler Planetarium 5\nAdler Planetarium 12\n"
             "Adler Planetarium 13\nAdler Planetarium 14\n"
             "Adler Planetarium 17\nAdler Planetarium 18"},
        ]
        names = requested_library_names(messages)
        self.assertEqual(set(names), {
            "Adler Planetarium 3", "Adler Planetarium 5", "Adler Planetarium 12",
            "Adler Planetarium 13", "Adler Planetarium 14", "Adler Planetarium 17",
            "Adler Planetarium 18"})
        self.assertNotIn("Adler Planetarium 99", names)
        formula = exact_library_name_formula(names)
        self.assertIn('LOWER({Asset Name}&"")="adler planetarium 18"', formula)
        self.assertIn('{Rights_Status}="Owned"', formula)

    def test_untrusted_lines_cannot_inject_airtable_formula(self):
        self.assertEqual(requested_library_names([{"role": "user",
            "content": 'Adler Planetarium 3") OR (1=1'}]), [])
        self.assertIsNone(exact_library_name_formula(['x") OR (1=1']))
        self.assertNotIn('OR (1=1', exact_library_name_formula(
            ["Adler Planetarium 3", 'Adler 2") OR (1=1']))

    def test_does_not_read_model_replies_or_infer_unnamed_photos(self):
        messages = [{"role": "producer", "content": "Adler Planetarium 5"},
                    {"role": "user", "content": "Use a different photo."}]
        self.assertEqual(requested_library_names(messages), [])

    def test_enforces_bounded_name_count(self):
        names = requested_library_names([{"role": "user", "content": "\n".join(
            "Museum Photo " + str(i) for i in range(1, 45))}])
        self.assertEqual(len(names), MAX_REQUESTED_NAMES)
        self.assertEqual(len(set(names)), MAX_REQUESTED_NAMES)


if __name__ == "__main__":
    unittest.main()
