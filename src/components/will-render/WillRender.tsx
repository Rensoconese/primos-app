'use client';

import React, { FC, ReactNode } from 'react';

interface IWillRenderProps {
  when: boolean;
  children: ReactNode;
}

const WillRender: FC<IWillRenderProps> = ({ when, children }) => {
  return when ? <>{children}</> : null;
};

export default WillRender;
