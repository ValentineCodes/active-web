-- Profile photos are no longer capped at 2 MB in the client. Compression comes later.
update storage.buckets
set file_size_limit = 52428800
where id = 'avatars';
