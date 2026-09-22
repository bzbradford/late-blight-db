-- Generator for incidents.public_id: the 5-character ID shown in CSV exports and used to
-- match re-imported rows. The integer primary key stays internal.
--
-- Alphabet: digits and consonants, with look-alikes (0 o 1 l i) removed, and no vowels so
-- no accidental words or month names. The first character is always a letter, so Excel
-- cannot read an ID as a number ("12e45" -> 1.2E+46) or strip a leading zero.
--
-- Must match PUBLIC_ID_LETTERS / PUBLIC_ID_ALPHABET in src/lib/public-id.ts; a unit test
-- reads this file to hold them together.
--
-- random() is not cryptographic, which is fine: these IDs are labels, not secrets.
-- Uniqueness is enforced by the column's unique index; inserts retry on a collision.
CREATE OR REPLACE FUNCTION gen_public_id() RETURNS char(5)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
	letters constant text := 'bcdfghjkmnpqrstvwxz';
	alphabet constant text := '23456789bcdfghjkmnpqrstvwxz';
	result text;
BEGIN
	result := substr(letters, 1 + floor(random() * length(letters))::int, 1);
	FOR i IN 1..4 LOOP
		result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
	END LOOP;
	RETURN result;
END;
$$;
