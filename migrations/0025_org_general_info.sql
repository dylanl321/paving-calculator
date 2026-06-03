-- PaveRate D1 Database Schema
-- Migration 0024: Add general info fields to organizations table
-- Supports the Organization Settings page General tab

ALTER TABLE organizations ADD COLUMN address TEXT;
ALTER TABLE organizations ADD COLUMN superintendent_email TEXT;
ALTER TABLE organizations ADD COLUMN superintendent_phone TEXT;
