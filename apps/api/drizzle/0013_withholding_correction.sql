-- "Corregir retención" (ADR 0005): the IRPF withholding is not part of the record, so a copy that is not
-- voided may change its withholding, and with it the withholding of its breakdown and the total to pay,
-- as long as they stay what the breakdown computes (rounded half away from zero, like the domain). The
-- rest stays frozen but for migration 0011's corrections of an incident.
CREATE OR REPLACE FUNCTION "freeze_issued_invoice"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	latest_status text;
	withheld numeric;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Invoice % is issued and cannot be deleted', OLD.id;
	END IF;
	IF (NEW.id, NEW.issuer_id, NEW.recipient_id, NEW.series, NEW.number, NEW.issue_date, NEW.issued_by, NEW.created_at, NEW.corrected_invoice_id)
		IS DISTINCT FROM (OLD.id, OLD.issuer_id, OLD.recipient_id, OLD.series, OLD.number, OLD.issue_date, OLD.issued_by, OLD.created_at, OLD.corrected_invoice_id)
		OR (NEW.snapshot - 'recipient' - 'operationDescription' - 'withholding' - 'breakdown')
			IS DISTINCT FROM (OLD.snapshot - 'recipient' - 'operationDescription' - 'withholding' - 'breakdown')
		OR ((NEW.snapshot -> 'breakdown') - 'withholding' - 'amountDue') IS DISTINCT FROM ((OLD.snapshot -> 'breakdown') - 'withholding' - 'amountDue')
	THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change', OLD.id;
	END IF;
	IF NEW.snapshot IS NOT DISTINCT FROM OLD.snapshot THEN
		RETURN NEW;
	END IF;
	IF (NEW.snapshot -> 'withholding', NEW.snapshot #> '{breakdown,withholding}', NEW.snapshot #> '{breakdown,amountDue}')
		IS DISTINCT FROM (OLD.snapshot -> 'withholding', OLD.snapshot #> '{breakdown,withholding}', OLD.snapshot #> '{breakdown,amountDue}')
	THEN
		withheld := round((NEW.snapshot #>> '{breakdown,taxBase}')::numeric * (NEW.snapshot ->> 'withholding')::numeric / 100, 2);
		IF OLD.status = 'voided'
			OR (NEW.snapshot #>> '{breakdown,withholding,rate}')::numeric IS DISTINCT FROM (NEW.snapshot ->> 'withholding')::numeric
			OR (NEW.snapshot #>> '{breakdown,withholding,amount}')::numeric IS DISTINCT FROM withheld
			OR (NEW.snapshot #>> '{breakdown,amountDue}')::numeric IS DISTINCT FROM (NEW.snapshot #>> '{breakdown,totalAmount}')::numeric - withheld
		THEN
			RAISE EXCEPTION 'Invoice % is issued and its withholding cannot change this way', OLD.id;
		END IF;
	END IF;
	IF (NEW.snapshot -> 'recipient', NEW.snapshot -> 'operationDescription')
		IS NOT DISTINCT FROM (OLD.snapshot -> 'recipient', OLD.snapshot -> 'operationDescription')
	THEN
		RETURN NEW;
	END IF;
	SELECT "status" INTO latest_status FROM "invoice_records" WHERE "invoice_id" = OLD.id ORDER BY "created_at" DESC LIMIT 1;
	IF latest_status IS NULL OR latest_status NOT IN ('blocked', 'rejected', 'accepted-with-errors')
		OR (latest_status = 'accepted-with-errors' AND NEW.snapshot -> 'recipient' IS DISTINCT FROM OLD.snapshot -> 'recipient')
	THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change this way while its record is %', OLD.id, latest_status;
	END IF;
	RETURN NEW;
END;
$$;
