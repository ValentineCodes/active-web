import { Link as RouterLink, type LinkProps } from 'react-router-dom';

type AppLinkProps = Omit<LinkProps, 'to'> & { href: string };

export default function Link({ href, ...rest }: AppLinkProps) {
  return <RouterLink to={href} {...rest} />;
}