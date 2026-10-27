import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users=sqliteTable('users',{id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),password:text('password').notNull(),role:text('role').notNull(),created:integer('created').notNull()});
export const sessions=sqliteTable('sessions',{token:text('token').primaryKey(),userId:text('user_id').notNull(),expires:integer('expires').notNull()});
export const attempts=sqliteTable('attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),until:integer('until').notNull()});
export const materials=sqliteTable('materials',{id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull(),grade:integer('grade').notNull(),subject:text('subject').notNull(),kind:text('kind').notNull(),content:text('content').notNull(),published:integer('published').notNull().default(0),created:integer('created').notNull()});
export const attachments=sqliteTable('attachments',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),mime:text('mime').notNull(),data:text('data').notNull(),created:integer('created').notNull()});
