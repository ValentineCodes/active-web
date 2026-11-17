import { forwardRef } from 'react';
import { Link as RouterLink, type LinkProps } from 'react-router-dom';

type AppLinkProps = Omit<LinkProps, 'to'> & { href: string };

const Link = forwardRef<HTMLAnchorElement, AppLinkProps>(function Link({ href, ...rest }, ref) {
  return <RouterLink to={href} ref={ref} {...rest} />;
});

export default Link;