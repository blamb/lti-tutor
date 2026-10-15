-- Runs once, when the Postgres volume is first created. The tutor's
-- database comes from POSTGRES_DB; Persona Chat gets its own here.
-- On an existing volume run: createdb -U postgres persona_chat
create database persona_chat;
