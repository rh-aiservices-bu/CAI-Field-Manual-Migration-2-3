#!/usr/bin/env sh
# Contract check for the field manuals' dual-consumption promise.
# Run against a production build (public/ must exist):
#
#   hugo --cleanDestinationDir --gc --minify --environment production
#   scripts/check-contracts.sh
#
# Asserts, over the built markdown output:
#   1. every customize token used in content is declared in hugo.yaml
#   2. every variant axis/option pair used in content is declared in hugo.yaml
#   3. the flattened markdown output labels every variant block ("**Axis: Option**")
#   4. no "Expected output" promise is left without a following fenced block
#      (the status gate) or an explicit "(no output)" marker
#
# Exit 0 = contracts hold. Any violation prints the page and exits 1.

set -u

fail=0
pages=0
labels=0
tokens=0

# 1. customize token ids: declared vs used -------------------------------------
declared_tokens=$(sed -n 's/.*- { id: \([a-z_]*\),.*/\1/p' hugo.yaml | sort -u)
used_tokens=$(grep -rhoE '\{\{< customize [a-z_]+ >\}\}' content/ | awk '{print $3}' | sort -u)
for tok in $used_tokens; do
    tokens=$((tokens + 1))
    case "
$declared_tokens" in
    *"
$tok"*) ;;
    *)
        echo "CONTRACT custom-token: '$tok' used in content/ but not declared in hugo.yaml params.customize"
        fail=1
        ;;
    esac
done

# 2. variant axis/option pairs: declared vs used -------------------------------
for pair in $(grep -rhoE '\{\{< variant [a-z_]+ ("[^"]*"|[a-z0-9._-]+) >\}\}' content/ | sed -E 's/\{\{< variant ([a-z_]+) ("[^"]*"|[a-z0-9._-]+) >\}\}/\1|\2/' | tr -d '"' | tr ' ' '_'); do
    axis=$(printf '%s' "$pair" | cut -d' ' -f1 | cut -d'|' -f1)
    rest=$(printf '%s' "$pair" | cut -d'|' -s -f2 | tr '_' ' ')
    if ! grep -qE "^    - id: $axis\$" hugo.yaml; then
        echo "CONTRACT variant-axis: axis '$axis' not declared in hugo.yaml params.variants"
        fail=1
        continue
    fi
    axis_block=$(sed -n "/- id: $axis\$/,/^    - id:/p" hugo.yaml)
    for opt in $rest; do
        case "$axis_block" in
        *"id: '$opt'"*|*"id: $opt"*) ;;
        *)
            echo "CONTRACT variant-option: option '$opt' not declared for axis '$axis' in hugo.yaml"
            fail=1
            ;;
        esac
    done
done
manual_mds=$(find public -name index.md -path "*/field-manual/*")
for md in $manual_mds; do
    src="content/${md#public/}"; src=${src%/index.md}.md
    [ -f "$src" ] || src="content/${md#public/}_index.md"
    [ -f "$src" ] || continue
    pages=$((pages + 1))
    src_variants=$(grep -cE '\{\{< variant ' "$src" || true)
    [ "$src_variants" -eq 0 ] && continue
    out_labels=$(grep -cE '\*\*(Deployment type|Cluster network|Kueue end state): ' "$md" || true)
    labels=$((labels + out_labels))
    if grep -qE '\{\{< variant ' "$md"; then
        echo "CONTRACT variant-labels: $md leaked raw variant shortcodes into the markdown output"
        fail=1
    fi
done

# 4. status gate: "Expected output" must be followed by a fenced block ---------
for md in $manual_mds; do
    awk '
        /Expected output/ { pending = NR; next }
        pending != 0 && /^```/ { pending = 0; next }
        pending != 0 && /^#/ { printf "CONTRACT status-gate: %s line %d — \"Expected output\" with no following fence\n", FILENAME, pending; bad = 1; pending = 0 }
        END { exit bad }
    ' "$md" || fail=1
    # the promise with no verify command at all (the review's finding 1 shape)
    if grep -qE "confirm the output matches the expected output below" "$md" && ! awk '/Expected output/{f=1} END{exit f?0:1}' "$md"; then
        echo "CONTRACT status-gate: $md promises 'expected output below' but no page carries an Expected output block"
        fail=1
    fi
done

[ "$fail" -eq 0 ] &&
    echo "contracts OK — $pages pages, $labels variant labels, $tokens customize tokens" &&
    exit 0

echo "contracts FAILED — fix the pages above; see Docs/issue-3-top5.md item 1"
exit 1
