export const getPortraitChatHeaderMetrics = ({
	isTablet,
	topInset,
}: {
	isTablet: boolean;
	topInset: number;
}) => {
	const isPhonePortrait = !isTablet;
	const safeTop = isPhonePortrait ? topInset : 0;
	const buttonSize = isPhonePortrait ? 42 : 48;
	const iconSize = isPhonePortrait ? 21 : 23;
	const titleFontSize = isPhonePortrait ? 16 : 20;

	return {
		height: isPhonePortrait ? 64 + safeTop : 76,
		paddingTop: safeTop,
		buttonSize,
		iconSize,
		titleFontSize,
	};
};
