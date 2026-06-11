const { Client } = require('pg');
const { parse }  = require('csv-parse/sync');
const fs         = require('fs');

// Conexão direta (sem pgbouncer) para DDL e bulk insert
const DIRECT_URL =
  'postgresql://postgres.mltqgslcblrfpwsbdbxn:sOlyKVxdwroW68mX' +
  '@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const CSV_PATH =
  'C:\\Users\\Marco Antônio\\Downloads\\' +
  'scopus_export_Apr 30-2026_9d907094-2a69-4cfa-bd7b-0cbf6bd8794c - scopus_export_Apr 30-2026_9d907094-2a69-4cfa-bd7b-0cbf6bd8794c.csv';

async function main() {
  console.log('\n📦 Importador Scopus → Supabase\n');

  if (!fs.existsSync(CSV_PATH)) {
    console.error('✗ Arquivo CSV não encontrado:', CSV_PATH);
    process.exit(1);
  }

  const client = new Client({ connectionString: DIRECT_URL });

  try {
    console.log('Conectando ao banco...');
    await client.connect();
    console.log('✓ Conectado ao Supabase\n');

    // Cria tabela
    await client.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id               SERIAL PRIMARY KEY,
        authors          TEXT,
        author_full_names TEXT,
        author_ids       TEXT,
        title            TEXT,
        year             INTEGER,
        source_title     TEXT,
        cited_by         INTEGER DEFAULT 0,
        doi              TEXT,
        link             TEXT,
        abstract         TEXT,
        author_keywords  TEXT,
        index_keywords   TEXT,
        references_text  TEXT,
        issn             TEXT,
        isbn             TEXT,
        coden            TEXT,
        language         TEXT,
        document_type    TEXT,
        open_access      TEXT,
        source           TEXT
      )
    `);
    console.log('✓ Tabela "articles" criada/verificada');

    // Lê e parseia CSV
    console.log('Lendo CSV...');
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const records = parse(content, {
      columns: header => header.map(h => h.replace(/^﻿/, '').replace(/^"|"$/g, '').trim()),
      skip_empty_lines:   true,
      relax_quotes:       true,
      relax_column_count: true,
      trim:               true,
    });
    console.log(`✓ ${records.length} registros encontrados no CSV\n`);

    // Limpa dados anteriores
    await client.query('TRUNCATE TABLE articles RESTART IDENTITY');
    console.log('✓ Tabela limpa (pronta para nova importação)\n');

    // Insere em lotes de 50
    const BATCH = 50;
    let inserted = 0;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const COLS  = 20;
      const vals  = [];

      const placeholders = batch.map((row, j) => {
        const b = j * COLS;
        vals.push(
          row['Authors']                      || null,
          row['Author full names']            || null,
          row['Author(s) ID']                 || null,
          row['Title']                        || null,
          parseInt(row['Year'])               || null,
          row['Source title']                 || null,
          parseInt(row['Cited by'])           || 0,
          row['DOI']                          || null,
          row['Link']                         || null,
          row['Abstract']                     || null,
          row['Author Keywords']              || null,
          row['Index Keywords']               || null,
          row['References']                   || null,
          row['ISSN']                         || null,
          row['ISBN']                         || null,
          row['CODEN']                        || null,
          row['Language of Original Document']|| null,
          row['Document Type']                || null,
          row['Open Access']                  || null,
          row['Source']                       || null,
        );
        return (
          `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},` +
          `$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20})`
        );
      });

      await client.query(
        `INSERT INTO articles
          (authors,author_full_names,author_ids,title,year,source_title,cited_by,
           doi,link,abstract,author_keywords,index_keywords,references_text,
           issn,isbn,coden,language,document_type,open_access,source)
         VALUES ${placeholders.join(',')}`,
        vals
      );

      inserted += batch.length;
      process.stdout.write(`\r  Progresso: ${inserted}/${records.length}`);
    }

    console.log(`\n\n✅ Importação concluída! ${inserted} artigos inseridos na tabela "articles"`);

  } catch (err) {
    console.error('\n✗ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
