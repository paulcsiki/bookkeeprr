-- M12: rename legacy job kind 'nyaa_rss_poll' to 'indexer_poll'
UPDATE jobs SET kind = 'indexer_poll' WHERE kind = 'nyaa_rss_poll';
